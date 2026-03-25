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
// 1. 장르 분류 프롬프트
// ============================================================
const CLASSIFY_PROMPT = `이 사진의 장르를 분석하세요. 반드시 아래 JSON으로만 응답:
{
  "genre": "portrait|landscape|street|food|architecture|animal|night|concert|sports|general",
  "genreKo": "한글 장르명",
  "subGenre": "세부 장르 (예: 환경인물, 산악풍경, 카페음식)",
  "confidence": 0.95
}
genre는 반드시 위 목록 중 하나만 선택하세요. 목록에 없으면 "general"로 하세요.`;

// ============================================================
// 2. 장르별 전문가 크리틱 프로필
// ============================================================
const GENRE_CRITICS = {
  portrait: {
    nameKo: "인물", icon: "👤",
    critics: [
      { id: "portrait_lighting", nameKo: "인물조명 마스터", icon: "💡",
        prompt: `당신은 인물 사진 조명 전문가입니다. 20년간 스튜디오와 자연광 인물 촬영을 해왔습니다.
평가 시 특히 중시: lighting(렘브란트/루프/버터플라이 라이팅, 캐치라이트, 조명비), color(피부톤 재현, 화이트밸런스), focus(눈 초점, 배경 분리 보케)
조명이 인물의 감정과 분위기에 기여하는지 함께 판단하세요. references에서는 인물 조명이 뛰어난 작가를 추천하세요.` },
      { id: "portrait_expression", nameKo: "포즈/표정 디렉터", icon: "🎭",
        prompt: `당신은 인물 사진 포즈/표정 전문가입니다. 패션, 화보, 스냅 디렉팅 경력 15년.
평가 시 특히 중시: storytelling(표정의 감정, 시선 처리, 존재감), composition(포즈 자연스러움, 바디랭귀지, 프레임 내 배치), timing(자연스러운 순간 포착)
인물이 사진 속에서 살아있는 느낌인지 평가하세요. references에서는 인물 연출이 뛰어난 작가를 추천하세요.` },
      { id: "portrait_context", nameKo: "인물구도 전문가", icon: "🖼️",
        prompt: `당신은 인물 사진 구도/배경 전문가입니다. 환경인물, 로케이션 촬영 전문.
평가 시 특히 중시: composition(인물과 배경의 조화, 네거티브 스페이스), postProcessing(피부 보정 자연스러움, 톤 통일성), color(인물-배경 색조화)
배경이 인물의 이야기를 강화하는지 평가하세요. references에서는 환경인물 사진이 뛰어난 작가를 추천하세요.` }
    ]
  },
  landscape: {
    nameKo: "풍경", icon: "🏔️",
    critics: [
      { id: "landscape_atmosphere", nameKo: "분위기/색감 마스터", icon: "🌅",
        prompt: `당신은 풍경 사진 색감/분위기 전문가입니다. 골든아워, 블루아워, 기상 현상 촬영 전문.
평가 시 특히 중시: color(자연광, 색온도, 대기 원근감), storytelling(풍경의 감정과 계절감), lighting(골든아워/블루아워 활용)
자연의 순간적인 아름다움을 얼마나 담았는지 평가하세요.` },
      { id: "landscape_composition", nameKo: "풍경구도 전문가", icon: "📐",
        prompt: `당신은 풍경 사진 구도/시선유도 전문가입니다.
평가 시 특히 중시: composition(삼분법, 리딩라인, 전경-중경-후경), timing(최적 시간대, 동적 요소 타이밍), focus(하이퍼포컬, 포커스 스태킹)
시선이 자연스럽게 사진 속을 여행하는지 평가하세요.` },
      { id: "landscape_technical", nameKo: "풍경기술 전문가", icon: "⚙️",
        prompt: `당신은 풍경 사진 기술/후보정 전문가입니다. 다이나믹레인지, HDR, 파노라마 전문.
평가 시 특히 중시: postProcessing(다이나믹레인지, 노이즈, 샤프닝), lighting(하이라이트/섀도우 디테일), color(자연스러운 색감 vs 과보정)
기술적 완성도가 풍경의 감동을 살리는지 평가하세요.` }
    ]
  },
  street: {
    nameKo: "스트릿", icon: "🏙️",
    critics: [
      { id: "street_moment", nameKo: "순간포착 전문가", icon: "⚡",
        prompt: `당신은 스트릿 포토그래피 순간포착 전문가입니다. 앙리 카르티에 브레송의 '결정적 순간' 철학.
평가 시 특히 중시: timing(결정적 순간, 우연의 조화), storytelling(도시의 서사, 인간 군상), composition(순간적 판단의 구도, 레이어링)
거리의 찰나를 얼마나 날카롭게 포착했는지 평가하세요.` },
      { id: "street_story", nameKo: "스토리텔링 전문가", icon: "📖",
        prompt: `당신은 다큐멘터리/스트릿 스토리텔링 전문가입니다.
평가 시 특히 중시: storytelling(한 장이 전달하는 이야기와 감정), color(도시 분위기 톤, 흑백 vs 컬러), lighting(네온, 가로등, 자연광 혼합)
그 장소, 그 순간에 있는 듯한 느낌을 받는지 평가하세요.` },
      { id: "street_frame", nameKo: "스트릿구도 전문가", icon: "🔲",
        prompt: `당신은 스트릿 사진 구도/프레이밍 전문가입니다.
평가 시 특히 중시: composition(도시 요소 프레이밍, 리딩라인, 시선 유도), focus(존포커스, 프리포커스 전략), postProcessing(스트릿 톤, 분위기)
혼란스러운 거리에서 질서를 만들어내는 구도력을 평가하세요.` }
    ]
  },
  food: {
    nameKo: "음식", icon: "🍽️",
    critics: [
      { id: "food_styling", nameKo: "푸드스타일링 전문가", icon: "🎨",
        prompt: `당신은 푸드 포토그래피 스타일링 전문가입니다. 매거진, 레스토랑 촬영 전문.
평가 시 특히 중시: composition(플레이팅, 소품 배치, 배열), storytelling(음식의 스토리, 계절감), color(식욕 자극 색감, 보색 대비)
먹고 싶어지는 사진인지 평가하세요.` },
      { id: "food_light", nameKo: "음식조명 전문가", icon: "💡",
        prompt: `당신은 푸드 포토그래피 조명 전문가입니다.
평가 시 특히 중시: lighting(자연광/인공광, 질감 살리는 각도), color(화이트밸런스, 음식 색감 재현), focus(디테일 선명도, 보케)
음식의 질감(촉촉함, 바삭함, 윤기)이 잘 표현되었는지 평가하세요.` },
      { id: "food_angle", nameKo: "앵글/구도 전문가", icon: "📐",
        prompt: `당신은 푸드 포토그래피 앵글 전문가입니다.
평가 시 특히 중시: composition(탑뷰/45도/아이레벨 선택, 여백 활용), postProcessing(완성도, 크롭, SNS 적합성), timing(가장 맛있어 보이는 순간)
앵글이 음식 매력을 최대로 끌어냈는지 평가하세요.` }
    ]
  },
  architecture: {
    nameKo: "건축", icon: "🏛️",
    critics: [
      { id: "arch_line", nameKo: "라인/대칭 전문가", icon: "📏",
        prompt: `당신은 건축 사진 라인/기하학 전문가입니다.
평가 시 특히 중시: composition(수직/수평 정렬, 대칭, 기하학적 패턴), focus(디테일 선명도), postProcessing(원근 왜곡 보정, 렌즈 보정)
건축물의 구조적 아름다움을 기하학적으로 표현했는지 평가하세요.` },
      { id: "arch_light", nameKo: "빛/그림자 전문가", icon: "🌓",
        prompt: `당신은 건축 사진 빛/그림자 전문가입니다.
평가 시 특히 중시: lighting(자연광 명암, 시간대별 빛 변화), color(소재 색감과 질감), storytelling(빛과 그림자의 분위기)
빛이 건축 공간의 성격을 어떻게 정의하는지 평가하세요.` },
      { id: "arch_space", nameKo: "공간감/원근 전문가", icon: "🔭",
        prompt: `당신은 건축 사진 공간/원근 전문가입니다.
평가 시 특히 중시: composition(광각/표준 선택, 소실점, 스케일 대비), timing(인물 등 동적 요소 조화), postProcessing(HDR, 하늘 디테일, 톤)
공간의 웅장함이나 친밀감을 얼마나 전달하는지 평가하세요.` }
    ]
  },
  animal: {
    nameKo: "동물", icon: "🐾",
    critics: [
      { id: "animal_moment", nameKo: "동물행동 포착 전문가", icon: "⚡",
        prompt: `당신은 동물/야생 사진 행동 포착 전문가입니다.
평가 시 특히 중시: timing(결정적 동작, 표정 포착), storytelling(동물의 성격, 행동 서사), focus(눈 초점, 고속 셔터)
동물의 생동감 있는 순간을 포착했는지 평가하세요.` },
      { id: "animal_portrait", nameKo: "동물초상 전문가", icon: "🐕",
        prompt: `당신은 동물 포트레이트 전문가입니다.
평가 시 특히 중시: composition(동물과 배경 관계, 시선 처리), lighting(자연광으로 털/깃 질감 표현), color(자연스러운 색감)
동물의 존재감과 개성이 드러나는지 평가하세요.` },
      { id: "animal_env", nameKo: "서식환경 전문가", icon: "🌿",
        prompt: `당신은 동물-환경 사진 전문가입니다.
평가 시 특히 중시: composition(동물과 서식지 조화), postProcessing(전체 톤, 자연스러움), storytelling(환경 속 동물의 이야기)
동물이 자연 환경과 어떻게 어우러지는지 평가하세요.` }
    ]
  },
  night: {
    nameKo: "야경", icon: "🌃",
    critics: [
      { id: "night_light", nameKo: "야간조명 전문가", icon: "💡",
        prompt: `당신은 야경/야간 촬영 조명 전문가입니다.
평가 시 특히 중시: lighting(인공조명 활용, 네온, 가로등, 빛 궤적), color(야간 색온도, 화이트밸런스), focus(야간 포커싱 정확도)
도시의 빛을 예술적으로 담았는지 평가하세요.` },
      { id: "night_tech", nameKo: "야간기술 전문가", icon: "⚙️",
        prompt: `당신은 야간 촬영 기술 전문가입니다. 장노출, 고감도 전문.
평가 시 특히 중시: postProcessing(노이즈 처리, 장노출 합성), timing(적절한 노출 시간, 빛 궤적 타이밍), focus(삼각대 안정성, 선명도)
야간 기술적 난이도를 극복했는지 평가하세요.` },
      { id: "night_mood", nameKo: "야경분위기 전문가", icon: "🌙",
        prompt: `당신은 야경 분위기/감성 전문가입니다.
평가 시 특히 중시: storytelling(밤의 서사와 감정), composition(빛과 어둠의 균형, 시선 유도), color(야간 특유의 색감과 분위기)
밤만의 감성을 얼마나 전달하는지 평가하세요.` }
    ]
  },
  concert: {
    nameKo: "공연", icon: "🎤",
    critics: [
      { id: "concert_moment", nameKo: "공연순간 포착 전문가", icon: "⚡",
        prompt: `당신은 공연/라이브 포토그래피 전문가입니다.
평가 시 특히 중시: timing(퍼포먼스 절정, 감정 극대화 순간), storytelling(무대 에너지, 아티스트 감정), focus(저조도 포커싱)
공연의 에너지를 한 장에 담았는지 평가하세요.` },
      { id: "concert_light", nameKo: "무대조명 전문가", icon: "🔦",
        prompt: `당신은 무대 조명 촬영 전문가입니다.
평가 시 특히 중시: lighting(무대 조명 활용, 역광, 스포트라이트), color(무대 색감, LED 조명 톤), postProcessing(고감도 노이즈, 색보정)
무대 조명을 작품으로 승화시켰는지 평가하세요.` },
      { id: "concert_comp", nameKo: "공연구도 전문가", icon: "🎬",
        prompt: `당신은 공연 사진 구도 전문가입니다.
평가 시 특히 중시: composition(무대-관객 관계, 프레이밍, 앵글), storytelling(공연 전체 분위기), timing(군중 반응, 하이라이트 장면)
공연장의 공간감과 현장감을 전달하는지 평가하세요.` }
    ]
  },
  sports: {
    nameKo: "스포츠", icon: "⚽",
    critics: [
      { id: "sports_action", nameKo: "액션 포착 전문가", icon: "⚡",
        prompt: `당신은 스포츠 액션 포토그래피 전문가입니다.
평가 시 특히 중시: timing(결정적 동작 순간), focus(고속 AF 추적, 모션 블러 활용), composition(액션의 방향성과 텐션)
스포츠의 역동적인 순간을 포착했는지 평가하세요.` },
      { id: "sports_emotion", nameKo: "스포츠감성 전문가", icon: "🏆",
        prompt: `당신은 스포츠 감성/스토리 전문가입니다.
평가 시 특히 중시: storytelling(승패의 드라마, 선수 감정), lighting(경기장 조명 활용), color(유니폼, 경기장 색감)
스포츠의 감동과 드라마를 전달하는지 평가하세요.` },
      { id: "sports_tech", nameKo: "스포츠기술 전문가", icon: "⚙️",
        prompt: `당신은 스포츠 촬영 기술 전문가입니다.
평가 시 특히 중시: focus(AF 성능 활용, 피사계 심도), postProcessing(크롭, 노이즈 처리), composition(배경 정리, 주체 분리)
기술적 난이도를 극복했는지 평가하세요.` }
    ]
  },
  general: {
    nameKo: "일반", icon: "📷",
    critics: [
      { id: "general_tech", nameKo: "기술 전문가", icon: "⚙️",
        prompt: `당신은 사진 기술 분석 전문가입니다.
평가 시 특히 중시: focus(초점 정확도, 심도 활용), lighting(노출, 다이나믹레인지), postProcessing(후보정 완성도)
기술적 완성도를 중심으로 평가하세요.` },
      { id: "general_art", nameKo: "예술성 전문가", icon: "🎨",
        prompt: `당신은 사진 예술성 전문가입니다.
평가 시 특히 중시: composition(구도 창의성), color(감정과 분위기), storytelling(메시지와 서사)
예술적 표현력을 중심으로 평가하세요.` },
      { id: "general_impact", nameKo: "임팩트 전문가", icon: "💥",
        prompt: `당신은 사진 임팩트 전문가입니다.
평가 시 특히 중시: storytelling(첫인상 강렬함), timing(순간 포착 희귀성), composition(시선을 사로잡는 구도)
사진을 본 순간의 임팩트를 평가하세요.` }
    ]
  }
};

// ============================================================
// 3. 평가 기본 프롬프트 (전문가 역할 프롬프트 뒤에 붙음)
// ============================================================
const EVAL_PROMPT = `
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
      "reason": "참고 포인트"
    }
  ],
  "aiTags": ["태그1", "태그2"]
}

references: 이 사진 스타일 관련 유명 사진작가 2~3명 추천. 일본 작가도 포함.
aiTags: 장르/주제/분위기/스타일 한국어 태그 2~4개. 유사어 금지.
각 태그는 [장르/피사체] [분위기/감성] [기법/스타일] [색감/톤] 중 2~4개에서 선택.`;

// ============================================================
// 4. 합의 프롬프트 빌더
// ============================================================
function buildCriticPrompt(criticProfile) {
  return criticProfile.prompt + "\n" + EVAL_PROMPT;
}

function buildConsensusPrompt(evaluations, critics) {
  const criticNames = critics.map(c => c.nameKo);
  let evalText = "";
  const keys = ["claude", "gpt", "gemini"];
  for (let i = 0; i < keys.length; i++) {
    evalText += `\n=== ${criticNames[i]} (${critics[i].icon}) 평가 ===\n${JSON.stringify(evaluations[keys[i]], null, 2)}\n`;
  }

  return `당신은 사진 평가 합의 진행자입니다.

아래는 동일한 사진에 대해 3명의 전문가 크리틱이 독립적으로 내린 평가입니다.
${evalText}
각 전문가의 점수 차이가 큰 항목을 중심으로 토론을 진행하고, 합의된 최종 결과를 도출해주세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "discussion": [
    { "speaker": "진행자", "text": "세 전문가의 평가를 검토한 결과..." },
    { "speaker": "${criticNames[0]}", "text": "저는 구도에 8.0을 줬는데..." },
    { "speaker": "${criticNames[1]}", "text": "저는 동의하지 않습니다..." },
    { "speaker": "${criticNames[2]}", "text": "두 의견을 종합하면..." },
    { "speaker": "진행자", "text": "토론 결과를 종합하면..." }
  ],
  "finalScores": {
    "composition": 7.5, "lighting": 6.5, "color": 7.0,
    "focus": 7.0, "storytelling": 6.5, "timing": 6.0, "postProcessing": 5.5
  },
  "finalCritique": {
    "summary": "3인 합의 요약",
    "strengths": ["강점1", "강점2"],
    "improvements": ["개선점1", "개선점2"],
    "technicalNotes": "기술적 조언"
  },
  "references": [{ "photographer": "작가명", "work": "작품명", "reason": "이유" }],
  "aiTags": ["태그1", "태그2", "태그3"]
}

토론은 3~6개 메시지로, 점수 차이가 큰 항목 위주로 논의하세요.
각 전문가는 자기 원래 평가 근거를 설명하고, 다른 의견에 동의/반박합니다.
최종 점수는 단순 평균이 아닌 토론 합의 점수여야 합니다.
aiTags: 유사어 금지, 서로 다른 카테고리에서 2~4개 선택.`;
}

// ============================================================
// 5. AI Provider calls
// ============================================================
async function callClaude(base64, apiKey, prompt) {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
        { type: "text", text: prompt || EVAL_PROMPT },
      ],
    }],
  });
  return parseAIResponse(message.content[0].text);
}

async function callGPT(base64, apiKey, prompt) {
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: "gpt-4.1-nano",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "high" } },
        { type: "text", text: prompt || EVAL_PROMPT },
      ],
    }],
  });
  return parseAIResponse(response.choices[0].message.content);
}

async function callGemini(base64, apiKey, retries, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: base64 } },
        { text: prompt || EVAL_PROMPT },
      ],
    }],
    generationConfig: { maxOutputTokens: 8192 },
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 429 && attempt < retries) {
      const waitMs = (attempt + 1) * 5000;
      console.warn(`Gemini rate limited, retrying in ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error: ${res.status} ${errText}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned empty response");
    return parseAIResponse(text);
  }
  throw new Error("Gemini failed after all retries");
}

// Gemini text-only call (for classification & consensus)
async function callGeminiText(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 8192 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini text API error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// Gemini image call for classification
async function classifyPhoto(base64, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: base64 } },
        { text: CLASSIFY_PROMPT },
      ],
    }],
    generationConfig: { maxOutputTokens: 256 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn("Classification failed, using general");
    return { genre: "general", genreKo: "일반", subGenre: "일반", confidence: 0 };
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  try {
    const cleaned = cleanJsonText(text);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no json");
    const result = JSON.parse(jsonMatch[0]);
    // Validate genre exists in our list
    if (!GENRE_CRITICS[result.genre]) result.genre = "general";
    return result;
  } catch (e) {
    console.warn("Classification parse failed, using general:", e.message);
    return { genre: "general", genreKo: "일반", subGenre: "일반", confidence: 0 };
  }
}

// ============================================================
// 6. Auto-evaluate on image upload (장르 분류 → 전문가 배정 → 평가 → 합의)
// ============================================================
exports.autoEvaluatePhoto = onObjectFinalized(
  {
    region: "asia-northeast1",
    secrets: [anthropicKey, openaiKey, geminiKey],
    memory: "1GiB",
    timeoutSeconds: 300,
  },
  async (event) => {
    const filePath = event.data.name;
    if (!filePath.match(/^photos\/[^/]+\/original\.(jpg|jpeg|png|webp)$/i)) return;

    const photoId = filePath.split("/")[1];
    const photoDoc = await db.doc(`photos/${photoId}`).get();
    if (photoDoc.exists && photoDoc.data().aiEvaluated) return;

    try {
      const base64 = await getResizedBase64(filePath);

      // Mark as processing
      await db.doc(`photos/${photoId}`).update({
        aiStatus: "processing",
        debateStatus: "processing",
        debateStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Step 1: 장르 분류 (Gemini Flash — 저렴, 빠름)
      const classification = await classifyPhoto(base64, geminiKey.value());
      const genre = GENRE_CRITICS[classification.genre] || GENRE_CRITICS.general;
      const critics = genre.critics;

      console.log(`Photo ${photoId} classified as: ${classification.genre} (${classification.genreKo})`);

      // Step 2: 3-AI 동시 평가 (각 AI에 장르 전문가 역할 배정)
      const [claudeResult, gptResult, geminiResult] = await Promise.allSettled([
        callClaude(base64, anthropicKey.value(), buildCriticPrompt(critics[0])),
        callGPT(base64, openaiKey.value(), buildCriticPrompt(critics[1])),
        callGemini(base64, geminiKey.value(), 2, buildCriticPrompt(critics[2])),
      ]);

      const evaluations = {
        claude: claudeResult.status === "fulfilled" ? claudeResult.value : null,
        gpt: gptResult.status === "fulfilled" ? gptResult.value : null,
        gemini: geminiResult.status === "fulfilled" ? geminiResult.value : null,
      };

      const successfulEvals = Object.values(evaluations).filter(Boolean);

      if (successfulEvals.length < 2) {
        const fallback = successfulEvals[0];
        if (fallback) {
          await db.doc(`photos/${photoId}`).update({
            scores: fallback.scores,
            totalScore: fallback.totalScore,
            critique: fallback.critique,
            references: fallback.references || [],
            aiTags: fallback.aiTags || [],
            category: (fallback.aiTags && fallback.aiTags[0]) || "미분류",
            aiEvaluated: true,
            aiEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
            aiModel: "single-ai-fallback",
            aiStatus: "done",
            debateStatus: "error",
            debateError: "최소 2개 AI 응답 필요. 단일 결과로 대체.",
            photoType: classification.genre,
            photoTypeKo: classification.genreKo || genre.nameKo,
            photoTypeIcon: genre.icon,
            photoSubType: classification.subGenre || "",
            assignedCritics: critics.map(c => ({ id: c.id, nameKo: c.nameKo, icon: c.icon })),
          });
          return;
        }
        throw new Error("모든 AI 평가 실패");
      }

      // Step 3: 합의 (Gemini Flash로 토론 진행)
      const filledEvaluations = {};
      for (const [key, val] of Object.entries(evaluations)) {
        filledEvaluations[key] = val || { scores: {}, critique: { summary: "(응답 실패)" } };
      }

      const consensusText = await callGeminiText(
        geminiKey.value(),
        buildConsensusPrompt(filledEvaluations, critics)
      );
      const debateResult = parseDebateResponse(consensusText);

      const finalValues = Object.values(debateResult.finalScores);
      const finalTotal = Math.round((finalValues.reduce((a, b) => a + b, 0) / finalValues.length) * 10) / 10;

      await db.doc(`photos/${photoId}`).update({
        scores: debateResult.finalScores,
        totalScore: finalTotal,
        critique: debateResult.finalCritique,
        references: debateResult.references || [],
        aiTags: debateResult.aiTags || [],
        category: (debateResult.aiTags && debateResult.aiTags[0]) || "미분류",
        aiEvaluated: true,
        aiEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
        aiModel: "genre-expert-consensus",
        aiStatus: "done",
        // 장르 & 전문가 정보
        photoType: classification.genre,
        photoTypeKo: classification.genreKo || genre.nameKo,
        photoTypeIcon: genre.icon,
        photoSubType: classification.subGenre || "",
        assignedCritics: critics.map(c => ({ id: c.id, nameKo: c.nameKo, icon: c.icon })),
        // 개별 평가
        individualEvaluations: {
          claude: evaluations.claude,
          gpt: evaluations.gpt,
          gemini: evaluations.gemini,
        },
        debate: debateResult.discussion,
        debateStatus: "done",
      });
    } catch (error) {
      console.error(`Failed to evaluate photo ${photoId}:`, error);
      await db.doc(`photos/${photoId}`).update({
        aiEvaluated: false,
        aiError: error.message,
        aiStatus: "error",
        debateStatus: "error",
      });
    }
  }
);

// ============================================================
// 7. Manual debate re-evaluation (callable)
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

    await db.doc(`photos/${photoId}`).update({
      debateStatus: "processing",
      debateStartedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      const [files] = await bucket.getFiles({ prefix: `photos/${photoId}/original` });
      if (files.length === 0) throw new HttpsError("not-found", "Image not found");
      const base64 = await getResizedBase64(files[0].name);

      // 장르 분류
      const classification = await classifyPhoto(base64, geminiKey.value());
      const genre = GENRE_CRITICS[classification.genre] || GENRE_CRITICS.general;
      const critics = genre.critics;

      // 3-AI 평가
      const [claudeResult, gptResult, geminiResult] = await Promise.allSettled([
        callClaude(base64, anthropicKey.value(), buildCriticPrompt(critics[0])),
        callGPT(base64, openaiKey.value(), buildCriticPrompt(critics[1])),
        callGemini(base64, geminiKey.value(), 2, buildCriticPrompt(critics[2])),
      ]);

      const evaluations = {
        claude: claudeResult.status === "fulfilled" ? claudeResult.value : null,
        gpt: gptResult.status === "fulfilled" ? gptResult.value : null,
        gemini: geminiResult.status === "fulfilled" ? geminiResult.value : null,
      };

      const successfulEvals = Object.values(evaluations).filter(Boolean);
      if (successfulEvals.length < 2) {
        throw new Error("최소 2개 AI 응답 필요");
      }

      const filledEvaluations = {};
      for (const [key, val] of Object.entries(evaluations)) {
        filledEvaluations[key] = val || { scores: {}, critique: { summary: "(응답 실패)" } };
      }

      const consensusText = await callGeminiText(
        geminiKey.value(),
        buildConsensusPrompt(filledEvaluations, critics)
      );
      const debateResult = parseDebateResponse(consensusText);

      const finalValues = Object.values(debateResult.finalScores);
      const finalTotal = Math.round((finalValues.reduce((a, b) => a + b, 0) / finalValues.length) * 10) / 10;

      await db.doc(`photos/${photoId}`).update({
        scores: debateResult.finalScores,
        totalScore: finalTotal,
        critique: debateResult.finalCritique,
        references: debateResult.references || [],
        aiTags: debateResult.aiTags || [],
        category: (debateResult.aiTags && debateResult.aiTags[0]) || "미분류",
        aiEvaluated: true,
        aiEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
        aiModel: "genre-expert-consensus",
        aiStatus: "done",
        photoType: classification.genre,
        photoTypeKo: classification.genreKo || genre.nameKo,
        photoTypeIcon: genre.icon,
        photoSubType: classification.subGenre || "",
        assignedCritics: critics.map(c => ({ id: c.id, nameKo: c.nameKo, icon: c.icon })),
        individualEvaluations: evaluations,
        debate: debateResult.discussion,
        debateStatus: "done",
      });

      return { success: true, totalScore: finalTotal, photoType: classification.genre };
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
// 8. Manual re-evaluate (3-AI debate, same as debateEvaluatePhoto)
// ============================================================
exports.reEvaluatePhoto = onCall(
  {
    region: "asia-northeast1",
    secrets: [anthropicKey, openaiKey, geminiKey],
    memory: "1GiB",
    timeoutSeconds: 300,
  },
  async (request) => {
    const { photoId } = request.data;
    if (!photoId) throw new HttpsError("invalid-argument", "photoId is required");

    await db.doc(`photos/${photoId}`).update({
      aiStatus: "processing",
      debateStatus: "processing",
      debateStartedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      const [files] = await bucket.getFiles({ prefix: `photos/${photoId}/original` });
      if (files.length === 0) throw new HttpsError("not-found", "Image not found");

      const base64 = await getResizedBase64(files[0].name);

      // 장르 분류
      const classification = await classifyPhoto(base64, geminiKey.value());
      const genre = GENRE_CRITICS[classification.genre] || GENRE_CRITICS.general;
      const critics = genre.critics;

      // 3-AI 평가
      const [claudeResult, gptResult, geminiResult] = await Promise.allSettled([
        callClaude(base64, anthropicKey.value(), buildCriticPrompt(critics[0])),
        callGPT(base64, openaiKey.value(), buildCriticPrompt(critics[1])),
        callGemini(base64, geminiKey.value(), 2, buildCriticPrompt(critics[2])),
      ]);

      const evaluations = {
        claude: claudeResult.status === "fulfilled" ? claudeResult.value : null,
        gpt: gptResult.status === "fulfilled" ? gptResult.value : null,
        gemini: geminiResult.status === "fulfilled" ? geminiResult.value : null,
      };

      const successfulEvals = Object.values(evaluations).filter(Boolean);
      if (successfulEvals.length < 2) {
        throw new Error("최소 2개 AI 응답 필요");
      }

      const filledEvaluations = {};
      for (const [key, val] of Object.entries(evaluations)) {
        filledEvaluations[key] = val || { scores: {}, critique: { summary: "(응답 실패)" } };
      }

      const consensusText = await callGeminiText(
        geminiKey.value(),
        buildConsensusPrompt(filledEvaluations, critics)
      );
      const debateResult = parseDebateResponse(consensusText);

      const finalValues = Object.values(debateResult.finalScores);
      const finalTotal = Math.round((finalValues.reduce((a, b) => a + b, 0) / finalValues.length) * 10) / 10;

      await db.doc(`photos/${photoId}`).update({
        scores: debateResult.finalScores,
        totalScore: finalTotal,
        critique: debateResult.finalCritique,
        references: debateResult.references || [],
        aiTags: debateResult.aiTags || [],
        category: (debateResult.aiTags && debateResult.aiTags[0]) || "미분류",
        aiEvaluated: true,
        aiEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
        aiModel: "genre-expert-consensus",
        aiStatus: "done",
        aiError: admin.firestore.FieldValue.delete(),
        photoType: classification.genre,
        photoTypeKo: classification.genreKo || genre.nameKo,
        photoTypeIcon: genre.icon,
        photoSubType: classification.subGenre || "",
        assignedCritics: critics.map(c => ({ id: c.id, nameKo: c.nameKo, icon: c.icon })),
        individualEvaluations: evaluations,
        debate: debateResult.discussion,
        debateStatus: "done",
      });

      return { success: true, totalScore: finalTotal, photoType: classification.genre };
    } catch (error) {
      console.error(`Re-evaluate failed for ${photoId}:`, error);
      await db.doc(`photos/${photoId}`).update({
        aiEvaluated: false,
        aiError: error.message,
        aiStatus: "error",
        debateStatus: "error",
      });
      throw new HttpsError("internal", error.message);
    }
  }
);

// ============================================================
// 9. Generate thumbnail on upload
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

function cleanJsonText(text) {
  let cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/i);
  if (codeBlockMatch) cleaned = codeBlockMatch[1];
  return cleaned;
}

function parseAIResponse(text) {
  const cleaned = cleanJsonText(text);
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse AI response as JSON");
  const result = JSON.parse(jsonMatch[0]);
  const scores = result.scores;
  const values = Object.values(scores);
  const totalScore = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  return { ...result, totalScore };
}

function parseDebateResponse(text) {
  const cleaned = cleanJsonText(text);
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse debate response as JSON");
  return JSON.parse(jsonMatch[0]);
}

// ============================================================
// 10. Re-tag all photos (admin batch)
// ============================================================
exports.reTagAllPhotos = onCall(
  {
    region: "asia-northeast1",
    secrets: [anthropicKey],
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인 필요");

    const photosSnap = await db.collection("photos").get();
    const results = { success: 0, failed: 0, total: photosSnap.size };

    for (const photoDoc of photosSnap.docs) {
      try {
        const [files] = await bucket.getFiles({ prefix: `photos/${photoDoc.id}/original` });
        if (files.length === 0) { results.failed++; continue; }

        const base64 = await getResizedBase64(files[0].name);
        const result = await callClaude(base64, anthropicKey.value(), EVAL_PROMPT);

        await db.doc(`photos/${photoDoc.id}`).update({
          scores: result.scores,
          totalScore: result.totalScore,
          critique: result.critique,
          references: result.references || [],
          aiTags: result.aiTags || [],
          category: (result.aiTags && result.aiTags[0]) || "미분류",
          aiEvaluated: true,
          aiEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
          aiModel: "claude-haiku-4-5-20251001",
          aiStatus: "done",
        });
        results.success++;
      } catch (err) {
        console.error(`Failed to re-tag ${photoDoc.id}:`, err);
        results.failed++;
      }
    }
    return results;
  }
);

// ============================================================
// 11. Admin: List users
// ============================================================
exports.listUsers = onCall(
  { region: "asia-northeast1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인 필요");
    try {
      const listResult = await admin.auth().listUsers(1000);
      const users = listResult.users.map(user => ({
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        createdAt: user.metadata.creationTime,
        lastSignIn: user.metadata.lastSignInTime,
        disabled: user.disabled,
      }));
      return { users };
    } catch (error) {
      console.error("Failed to list users:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

// ============================================================
// 12. AI Tag Cleanup
// ============================================================
exports.analyzeTagsForMerge = onCall(
  {
    region: "asia-northeast1",
    secrets: [anthropicKey],
    timeoutSeconds: 60,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인 필요");

    const { tags } = request.data;
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      throw new HttpsError("invalid-argument", "태그 목록 필요");
    }

    const tagListStr = tags.map(t => `"${t.name}" (${t.count}장)`).join(", ");
    const prompt = `당신은 사진 태그 정리 전문가입니다.
태그 목록: ${tagListStr}

병합해야 할 태그 그룹을 찾아주세요 (같은 의미, 포함 관계, 동의어, 한/영 중복).
반드시 아래 JSON으로만 응답:
{ "mergeGroups": [{ "target": "대표 태그", "sources": ["병합될 태그"], "reason": "이유" }] }
병합 불필요시 빈 배열. JSON만 응답.`;

    try {
      const client = new Anthropic({ apiKey: anthropicKey.value() });
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.content[0].text.trim();
      const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      const result = JSON.parse(jsonStr);
      return { mergeGroups: result.mergeGroups || [] };
    } catch (error) {
      console.error("AI tag analysis failed:", error);
      throw new HttpsError("internal", "AI 태그 분석 실패: " + error.message);
    }
  }
);

// ============================================================
// 13. Admin: Delete user
// ============================================================
exports.deleteAuthUser = onCall(
  { region: "asia-northeast1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "로그인 필요");
    const { uid } = request.data;
    if (!uid) throw new HttpsError("invalid-argument", "uid required");
    if (uid === request.auth.uid) throw new HttpsError("failed-precondition", "자기 자신 삭제 불가");
    try {
      await admin.auth().deleteUser(uid);
      return { success: true, deletedUid: uid };
    } catch (error) {
      console.error(`Failed to delete user ${uid}:`, error);
      throw new HttpsError("internal", error.message);
    }
  }
);
