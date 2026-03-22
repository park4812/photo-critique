const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const sharp = require("sharp");

admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();

// Secrets
const anthropicKey = defineSecret("ANTHROPIC_API_KEY");
const openaiKey = defineSecret("OPENAI_API_KEY");
const geminiKey = defineSecret("GEMINI_API_KEY");

// ============================================================
// System prompts
// ============================================================
const EVAL_PROMPT = `당신은 전문 사진 크리틱입니다.
업로드된 사진을 분석하고 다음 형식의 JSON으로 평가해주세요.

평가 항목 (각 0~10점, 소수점 첫째자리까지):
- composition: 구도
- lighting: 노출/빛
- color: 색감
- focus: 초점/심도
- storytelling: 스토리텔링
- timing: 타이밍
- postProcessing: 후보정 완성도

반드시 아래 JSON 형식으로만 응답하세요:
{
  "scores": {
    "composition": 7.5,
    "lighting": 6.0,
    "color": 8.0,
    "focus": 7.0,
    "storytelling": 6.5,
    "timing": 5.5,
    "postProcessing": 6.0
  },
  "critique": {
    "summary": "한두 문장의 전체 요약",
    "strengths": ["강점1", "강점2"],
    "improvements": ["개선점1", "개선점2"],
    "technicalNotes": "기술적 조언"
  },
  "references": [
    {
      "photographer": "작가 이름",
      "work": "대표 작품 또는 시리즈명",
      "reason": "이 사진과의 연관성 또는 참고 포인트"
    }
  ],
  "suggestedCategory": "거리/상점 외관",
  "suggestedTags": ["야간", "스트릿"]
}

references에는 이 사진의 스타일, 구도, 주제와 관련된 참고할 만한 유명 사진작가 2~3명을 추천해주세요.
도쿄 야간 거리 사진이므로 일본 사진작가도 적극적으로 포함하되, 해외 작가도 관련 있으면 포함하세요.
각 작가의 대표 작품이나 시리즈와 함께, 이 사진을 발전시키는 데 어떤 점을 참고하면 좋을지 간단히 설명해주세요.

카테고리는 다음 중 하나: 거리/상점 외관, 골목/거리 풍경, 정물/디테일, 음식, 실내/다큐멘터리
한국어로 작성하세요.`;

function buildDebatePrompt(evaluations) {
  return `당신은 사진 평가 토론의 진행자입니다.

아래는 동일한 사진에 대해 3명의 AI 크리틱이 독립적으로 내린 평가입니다.

=== Claude 평가 ===
${JSON.stringify(evaluations.claude, null, 2)}

=== GPT-4 평가 ===
${JSON.stringify(evaluations.gpt, null, 2)}

=== Gemini 평가 ===
${JSON.stringify(evaluations.gemini, null, 2)}

각 크리틱의 점수 차이가 큰 항목을 중심으로 토론을 진행하고, 합의된 최종 결과를 도출해주세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "discussion": [
    {
      "speaker": "진행자",
      "text": "세 크리틱의 평가를 검토한 결과, 다음 항목에서 의견 차이가 있습니다..."
    },
    {
      "speaker": "Claude",
      "text": "저는 구도에 8.0을 줬는데, 그 이유는..."
    },
    {
      "speaker": "GPT-4",
      "text": "저는 동의하지 않습니다. 구도가 7.0인 이유는..."
    },
    {
      "speaker": "Gemini",
      "text": "두 의견 모두 일리가 있지만, 저는..."
    },
    {
      "speaker": "진행자",
      "text": "토론 결과를 종합하면..."
    }
  ],
  "finalScores": {
    "composition": 7.5,
    "lighting": 6.5,
    "color": 7.0,
    "focus": 7.0,
    "storytelling": 6.5,
    "timing": 6.0,
    "postProcessing": 5.5
  },
  "finalCritique": {
    "summary": "3인 합의: 전체 요약",
    "strengths": ["합의된 강점1", "합의된 강점2"],
    "improvements": ["합의된 개선점1", "합의된 개선점2"],
    "technicalNotes": "합의된 기술적 조언"
  },
  "references": [
    {
      "photographer": "작가 이름",
      "work": "대표 작품 또는 시리즈명",
      "reason": "이 사진과의 연관성 또는 참고 포인트"
    }
  ],
  "suggestedCategory": "거리/상점 외관",
  "suggestedTags": ["야간", "스트릿"]
}

references에는 3인의 토론을 종합하여, 이 사진의 스타일과 관련된 참고할 만한 사진작가 2~3명을 추천해주세요.
토론은 3~6개 메시지로 진행하되, 점수 차이가 큰 항목 위주로 논의하세요.
각 크리틱은 자신의 원래 평가 근거를 설명하고, 다른 의견에 동의/반박합니다.
최종 점수는 단순 평균이 아닌 토론을 통해 합의된 점수여야 합니다.
한국어로 작성하세요.`;
}

// ============================================================
// AI Provider calls
// ============================================================
async function callClaude(base64, apiKey) {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
        { type: "text", text: EVAL_PROMPT },
      ],
    }],
  });
  return parseAIResponse(message.content[0].text);
}

async function callGPT(base64, apiKey) {
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "high" } },
        { type: "text", text: EVAL_PROMPT },
      ],
    }],
  });
  return parseAIResponse(response.choices[0].message.content);
}

async function callGemini(base64, apiKey) {
  // Gemini REST API (v1beta)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: base64 } },
        { text: EVAL_PROMPT },
      ],
    }],
    generationConfig: { maxOutputTokens: 1500 },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");
  return parseAIResponse(text);
}

async function callDebateModerator(evaluations, apiKey) {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: buildDebatePrompt(evaluations),
    }],
  });
  return parseDebateResponse(message.content[0].text);
}

// ============================================================
// 1. Auto-evaluate on image upload (single AI — fast)
// ============================================================
exports.autoEvaluatePhoto = onObjectFinalized(
  {
    region: "asia-northeast1",
    secrets: [anthropicKey],
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (event) => {
    const filePath = event.data.name;
    if (!filePath.match(/^photos\/[^/]+\/original\.(jpg|jpeg|png|webp)$/i)) return;

    const photoId = filePath.split("/")[1];
    const photoDoc = await db.doc(`photos/${photoId}`).get();
    if (photoDoc.exists && photoDoc.data().aiEvaluated) return;

    try {
      const base64 = await getResizedBase64(filePath);
      const result = await callClaude(base64, anthropicKey.value());

      await db.doc(`photos/${photoId}`).update({
        scores: result.scores,
        totalScore: result.totalScore,
        critique: result.critique,
        references: result.references || [],
        suggestedCategory: result.suggestedCategory || null,
        suggestedTags: result.suggestedTags || [],
        aiEvaluated: true,
        aiEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
        aiModel: "claude-sonnet-4-20250514",
        aiStatus: "done",
      });
    } catch (error) {
      console.error(`Failed to evaluate photo ${photoId}:`, error);
      await db.doc(`photos/${photoId}`).update({
        aiEvaluated: false,
        aiError: error.message,
        aiStatus: "error",
      });
    }
  }
);

// ============================================================
// 2. Multi-AI Debate Evaluation (callable)
// ============================================================
exports.debateEvaluatePhoto = onCall(
  {
    region: "asia-northeast1",
    secrets: [anthropicKey, openaiKey, geminiKey],
    memory: "1GiB",
    timeoutSeconds: 300,
  },
  async (request) => {
    const { photoId } = request.data;
    if (!photoId) throw new HttpsError("invalid-argument", "photoId is required");

    // Mark as processing
    await db.doc(`photos/${photoId}`).update({
      debateStatus: "processing",
      debateStartedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      // Get image
      const [files] = await bucket.getFiles({ prefix: `photos/${photoId}/original` });
      if (files.length === 0) throw new HttpsError("not-found", "Image not found");
      const base64 = await getResizedBase64(files[0].name);

      // Round 1: 3 AI independently evaluate
      const [claudeResult, gptResult, geminiResult] = await Promise.allSettled([
        callClaude(base64, anthropicKey.value()),
        callGPT(base64, openaiKey.value()),
        callGemini(base64, geminiKey.value()),
      ]);

      const evaluations = {
        claude: claudeResult.status === "fulfilled" ? claudeResult.value : null,
        gpt: gptResult.status === "fulfilled" ? gptResult.value : null,
        gemini: geminiResult.status === "fulfilled" ? geminiResult.value : null,
      };

      // Count successful evaluations
      const successfulEvals = Object.values(evaluations).filter(Boolean);
      if (successfulEvals.length < 2) {
        throw new Error("최소 2개 AI의 응답이 필요합니다. 실패한 모델을 확인하세요.");
      }

      // Fill nulls with placeholder for debate
      const filledEvaluations = {};
      for (const [key, val] of Object.entries(evaluations)) {
        filledEvaluations[key] = val || { scores: {}, critique: { summary: "(응답 실패)" } };
      }

      // Round 2: Debate & Consensus (Claude moderates)
      const debateResult = await callDebateModerator(filledEvaluations, anthropicKey.value());

      // Calculate final total score
      const finalValues = Object.values(debateResult.finalScores);
      const finalTotal = Math.round((finalValues.reduce((a, b) => a + b, 0) / finalValues.length) * 10) / 10;

      // Save everything
      await db.doc(`photos/${photoId}`).update({
        // Final consensus scores
        scores: debateResult.finalScores,
        totalScore: finalTotal,
        critique: debateResult.finalCritique,
        references: debateResult.references || [],
        suggestedCategory: debateResult.suggestedCategory || null,
        suggestedTags: debateResult.suggestedTags || [],
        aiEvaluated: true,
        aiEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
        aiModel: "multi-ai-debate",
        aiStatus: "done",
        // Individual evaluations
        individualEvaluations: {
          claude: evaluations.claude,
          gpt: evaluations.gpt,
          gemini: evaluations.gemini,
        },
        // Debate transcript
        debate: debateResult.discussion,
        debateStatus: "done",
      });

      return { success: true, totalScore: finalTotal };
    } catch (error) {
      console.error(`Debate evaluation failed for ${photoId}:`, error);
      await db.doc(`photos/${photoId}`).update({
        debateStatus: "error",
        debateError: error.message,
      });
      throw new HttpsError("internal", error.message);
    }
  }
);

// ============================================================
// 3. Manual re-evaluate (single AI, callable)
// ============================================================
exports.reEvaluatePhoto = onCall(
  {
    region: "asia-northeast1",
    secrets: [anthropicKey],
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (request) => {
    const { photoId } = request.data;
    if (!photoId) throw new HttpsError("invalid-argument", "photoId is required");

    const [files] = await bucket.getFiles({ prefix: `photos/${photoId}/original` });
    if (files.length === 0) throw new HttpsError("not-found", "Image not found");

    const base64 = await getResizedBase64(files[0].name);
    const result = await callClaude(base64, anthropicKey.value());

    await db.doc(`photos/${photoId}`).update({
      scores: result.scores,
      totalScore: result.totalScore,
      critique: result.critique,
      references: result.references || [],
      aiEvaluated: true,
      aiEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
      aiModel: "claude-sonnet-4-20250514",
    });

    return { success: true, totalScore: result.totalScore };
  }
);

// ============================================================
// 4. Generate thumbnail on upload
// ============================================================
exports.generateThumbnail = onObjectFinalized(
  {
    region: "asia-northeast1",
    memory: "256MiB",
  },
  async (event) => {
    const filePath = event.data.name;
    if (!filePath.match(/^photos\/[^/]+\/original\.(jpg|jpeg|png|webp)$/i)) return;

    const photoId = filePath.split("/")[1];
    const thumbPath = `photos/${photoId}/thumbnail.jpg`;

    const [exists] = await bucket.file(thumbPath).exists();
    if (exists) return;

    const file = bucket.file(filePath);
    const [buffer] = await file.download();

    const thumbnailBuffer = await sharp(buffer)
      .resize(400, 400, { fit: "cover" })
      .jpeg({ quality: 75 })
      .toBuffer();

    const thumbFile = bucket.file(thumbPath);
    await thumbFile.save(thumbnailBuffer, { metadata: { contentType: "image/jpeg" } });
    await thumbFile.makePublic();

    const thumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${thumbPath}`;
    await db.doc(`photos/${photoId}`).update({ thumbnailUrl });
  }
);

// ============================================================
// Helpers
// ============================================================
async function getResizedBase64(filePath) {
  const file = bucket.file(filePath);
  const [buffer] = await file.download();
  const resized = await sharp(buffer)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return resized.toString("base64");
}

function parseAIResponse(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse AI response as JSON");
  const result = JSON.parse(jsonMatch[0]);
  const scores = result.scores;
  const values = Object.values(scores);
  const totalScore = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  return { ...result, totalScore };
}

function parseDebateResponse(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse debate response as JSON");
  return JSON.parse(jsonMatch[0]);
}
