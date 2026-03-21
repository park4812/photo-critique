const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");
const sharp = require("sharp");

admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();

// Secrets (set via: firebase functions:secrets:set ANTHROPIC_API_KEY)
const anthropicKey = defineSecret("ANTHROPIC_API_KEY");

// ============================================================
// System prompt for AI photo critique
// ============================================================
const SYSTEM_PROMPT = `당신은 전문 사진 크리틱입니다.
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
    "strengths": ["강점1", "강점2", "강점3"],
    "improvements": ["개선점1", "개선점2"],
    "technicalNotes": "기술적 조언"
  },
  "suggestedCategory": "거리/상점 외관",
  "suggestedTags": ["야간", "스트릿"]
}

카테고리는 다음 중 하나: 거리/상점 외관, 골목/거리 풍경, 정물/디테일, 음식, 실내/다큐멘터리
한국어로 작성하세요.`;

// ============================================================
// 1. Auto-evaluate on image upload (Storage trigger)
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

    // Only process files in photos/{photoId}/original.jpg
    if (!filePath.match(/^photos\/[^/]+\/original\.(jpg|jpeg|png|webp)$/i)) {
      console.log(`Skipping non-photo file: ${filePath}`);
      return;
    }

    const photoId = filePath.split("/")[1];
    console.log(`Processing photo: ${photoId}`);

    // Check if already evaluated
    const photoDoc = await db.doc(`photos/${photoId}`).get();
    if (photoDoc.exists && photoDoc.data().aiEvaluated) {
      console.log(`Photo ${photoId} already evaluated, skipping.`);
      return;
    }

    try {
      // Download image
      const file = bucket.file(filePath);
      const [buffer] = await file.download();

      // Resize for API (max 1024px, keep aspect ratio, reduce size)
      const resizedBuffer = await sharp(buffer)
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      const base64 = resizedBuffer.toString("base64");
      console.log(`Image resized: ${(resizedBuffer.length / 1024).toFixed(0)}KB`);

      // Call Claude API
      const client = new Anthropic({ apiKey: anthropicKey.value() });

      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: base64,
                },
              },
              {
                type: "text",
                text: SYSTEM_PROMPT,
              },
            ],
          },
        ],
      });

      const responseText = message.content[0].text;
      const result = parseAIResponse(responseText);

      // Update Firestore
      await db.doc(`photos/${photoId}`).update({
        scores: result.scores,
        totalScore: result.totalScore,
        critique: result.critique,
        suggestedCategory: result.suggestedCategory || null,
        suggestedTags: result.suggestedTags || [],
        aiEvaluated: true,
        aiEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
        aiModel: "claude-sonnet-4-20250514",
      });

      console.log(`Photo ${photoId} evaluated successfully. Score: ${result.totalScore}`);
    } catch (error) {
      console.error(`Failed to evaluate photo ${photoId}:`, error);

      // Mark as failed so UI can show status
      await db.doc(`photos/${photoId}`).update({
        aiEvaluated: false,
        aiError: error.message,
        aiErrorAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
);

// ============================================================
// 2. Manual re-evaluate (callable function)
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

    if (!photoId) {
      throw new HttpsError("invalid-argument", "photoId is required");
    }

    // Find the original image
    const [files] = await bucket.getFiles({ prefix: `photos/${photoId}/original` });
    if (files.length === 0) {
      throw new HttpsError("not-found", "Original image not found");
    }

    const [buffer] = await files[0].download();

    const resizedBuffer = await sharp(buffer)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const base64 = resizedBuffer.toString("base64");

    const client = new Anthropic({ apiKey: anthropicKey.value() });

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64 },
            },
            { type: "text", text: SYSTEM_PROMPT },
          ],
        },
      ],
    });

    const result = parseAIResponse(message.content[0].text);

    await db.doc(`photos/${photoId}`).update({
      scores: result.scores,
      totalScore: result.totalScore,
      critique: result.critique,
      suggestedCategory: result.suggestedCategory || null,
      suggestedTags: result.suggestedTags || [],
      aiEvaluated: true,
      aiEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
      aiModel: "claude-sonnet-4-20250514",
    });

    return { success: true, totalScore: result.totalScore };
  }
);

// ============================================================
// 3. Generate thumbnail on upload
// ============================================================
exports.generateThumbnail = onObjectFinalized(
  {
    region: "asia-northeast1",
    memory: "256MiB",
  },
  async (event) => {
    const filePath = event.data.name;

    if (!filePath.match(/^photos\/[^/]+\/original\.(jpg|jpeg|png|webp)$/i)) {
      return;
    }

    const photoId = filePath.split("/")[1];
    const thumbPath = `photos/${photoId}/thumbnail.jpg`;

    // Check if thumbnail already exists
    const [exists] = await bucket.file(thumbPath).exists();
    if (exists) return;

    const file = bucket.file(filePath);
    const [buffer] = await file.download();

    const thumbnailBuffer = await sharp(buffer)
      .resize(400, 400, { fit: "cover" })
      .jpeg({ quality: 75 })
      .toBuffer();

    const thumbFile = bucket.file(thumbPath);
    await thumbFile.save(thumbnailBuffer, {
      metadata: { contentType: "image/jpeg" },
    });

    // Make thumbnail publicly accessible
    await thumbFile.makePublic();

    const thumbnailUrl = `https://storage.googleapis.com/${bucket.name}/${thumbPath}`;

    await db.doc(`photos/${photoId}`).update({ thumbnailUrl });

    console.log(`Thumbnail generated for ${photoId}`);
  }
);

// ============================================================
// Helper: Parse AI JSON response
// ============================================================
function parseAIResponse(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI response as JSON");
  }

  const result = JSON.parse(jsonMatch[0]);
  const scores = result.scores;
  const values = Object.values(scores);
  const totalScore =
    Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

  return { ...result, totalScore };
}
