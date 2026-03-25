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
      { id: "portrait_a", nameKo: "Claude", icon: "🟣" },
      { id: "portrait_b", nameKo: "GPT-4", icon: "🟢" },
      { id: "portrait_c", nameKo: "Gemini", icon: "🔵" }
    ],
    prompt: `당신은 인물 사진 전문 크리틱입니다. 스튜디오/자연광 인물, 패션, 스냅, 환경인물 등 모든 인물 촬영에 정통합니다.
모든 평가 항목을 균형 있게, 편향 없이 평가하세요:
- composition: 포즈, 바디랭귀지, 인물 배치, 배경과의 조화, 네거티브 스페이스
- lighting: 조명 패턴(렘브란트/루프/버터플라이 등), 캐치라이트, 조명비, 자연광 활용
- color: 피부톤 재현, 화이트밸런스, 인물-배경 색 조화
- focus: 눈 초점 정확도, 배경 분리 보케, 피사계 심도 선택
- storytelling: 표정의 감정, 시선 처리, 인물의 존재감과 서사
- timing: 자연스러운 순간 포착, 표정/동작의 결정적 순간
- postProcessing: 피부 보정 자연스러움, 톤 통일성, 전체 완성도
references에서는 인물 사진이 뛰어난 작가를 추천하세요.`
  },
  landscape: {
    nameKo: "풍경", icon: "🏔️",
    critics: [
      { id: "landscape_a", nameKo: "Claude", icon: "🟣" },
      { id: "landscape_b", nameKo: "GPT-4", icon: "🟢" },
      { id: "landscape_c", nameKo: "Gemini", icon: "🔵" }
    ],
    prompt: `당신은 풍경 사진 전문 크리틱입니다. 자연풍경, 도시풍경, 골든아워, 블루아워, 기상 현상 등 모든 풍경 촬영에 정통합니다.
모든 평가 항목을 균형 있게, 편향 없이 평가하세요:
- composition: 삼분법, 리딩라인, 전경-중경-후경 배치, 시선 유도
- lighting: 골든아워/블루아워 활용, 하이라이트/섀도우 디테일, 다이나믹레인지
- color: 자연광 색온도, 대기 원근감, 자연스러운 색감
- focus: 하이퍼포컬, 포커스 스태킹, 전체 선명도
- storytelling: 풍경의 감정과 계절감, 자연의 순간적 아름다움
- timing: 최적 시간대, 구름/빛/동적 요소의 타이밍
- postProcessing: HDR 처리, 노이즈, 샤프닝, 자연스러운 보정
references에서는 풍경 사진이 뛰어난 작가를 추천하세요.`
  },
  street: {
    nameKo: "스트릿", icon: "🏙️",
    critics: [
      { id: "street_a", nameKo: "Claude", icon: "🟣" },
      { id: "street_b", nameKo: "GPT-4", icon: "🟢" },
      { id: "street_c", nameKo: "Gemini", icon: "🔵" }
    ],
    prompt: `당신은 스트릿 포토그래피 전문 크리틱입니다. 거리 스냅, 다큐멘터리, 도시 일상 등 모든 스트릿 촬영에 정통합니다.
모든 평가 항목을 균형 있게, 편향 없이 평가하세요:
- composition: 도시 요소 프레이밍, 리딩라인, 레이어링, 시선 유도
- lighting: 네온, 가로등, 자연광 혼합, 명암 대비
- color: 도시 분위기 톤, 흑백 vs 컬러 선택의 적절성
- focus: 존포커스, 프리포커스 전략, 주체 선명도
- storytelling: 한 장이 전달하는 이야기, 도시의 서사, 인간 군상
- timing: 결정적 순간 포착, 우연의 조화
- postProcessing: 스트릿 톤, 분위기 보정, 크롭 적절성
references에서는 스트릿 사진이 뛰어난 작가를 추천하세요.`
  },
  food: {
    nameKo: "음식", icon: "🍽️",
    critics: [
      { id: "food_a", nameKo: "Claude", icon: "🟣" },
      { id: "food_b", nameKo: "GPT-4", icon: "🟢" },
      { id: "food_c", nameKo: "Gemini", icon: "🔵" }
    ],
    prompt: `당신은 푸드 포토그래피 전문 크리틱입니다. 매거진, 레스토랑, SNS 음식 촬영 등 모든 푸드 촬영에 정통합니다.
모든 평가 항목을 균형 있게, 편향 없이 평가하세요:
- composition: 플레이팅, 소품 배치, 앵글 선택(탑뷰/45도/아이레벨), 여백 활용
- lighting: 자연광/인공광 활용, 질감을 살리는 조명 각도
- color: 식욕 자극 색감, 보색 대비, 화이트밸런스, 음식 색감 재현
- focus: 디테일 선명도, 보케, 피사계 심도 선택
- storytelling: 음식의 스토리, 계절감, 먹고 싶어지는 매력
- timing: 가장 맛있어 보이는 순간, 질감(촉촉함/바삭함/윤기) 표현
- postProcessing: 전체 완성도, 크롭, SNS 적합성
references에서는 푸드 사진이 뛰어난 작가를 추천하세요.`
  },
  architecture: {
    nameKo: "건축", icon: "🏛️",
    critics: [
      { id: "arch_a", nameKo: "Claude", icon: "🟣" },
      { id: "arch_b", nameKo: "GPT-4", icon: "🟢" },
      { id: "arch_c", nameKo: "Gemini", icon: "🔵" }
    ],
    prompt: `당신은 건축 사진 전문 크리틱입니다. 현대건축, 전통건축, 인테리어, 도시경관 등 모든 건축 촬영에 정통합니다.
모든 평가 항목을 균형 있게, 편향 없이 평가하세요:
- composition: 수직/수평 정렬, 대칭, 기하학적 패턴, 소실점, 스케일 대비
- lighting: 자연광 명암, 시간대별 빛 변화, 빛과 그림자의 공간 정의
- color: 건축 소재 색감과 질감, 하늘과의 색 조화
- focus: 디테일 선명도, 피사계 심도, 광각/표준 렌즈 선택
- storytelling: 건축 공간의 성격, 웅장함/친밀감 전달
- timing: 인물 등 동적 요소 조화, 최적 촬영 시간
- postProcessing: 원근 왜곡 보정, HDR, 하늘 디테일, 톤 통일성
references에서는 건축 사진이 뛰어난 작가를 추천하세요.`
  },
  animal: {
    nameKo: "동물", icon: "🐾",
    critics: [
      { id: "animal_a", nameKo: "Claude", icon: "🟣" },
      { id: "animal_b", nameKo: "GPT-4", icon: "🟢" },
      { id: "animal_c", nameKo: "Gemini", icon: "🔵" }
    ],
    prompt: `당신은 동물/야생 사진 전문 크리틱입니다. 반려동물, 야생동물, 조류, 수중생물 등 모든 동물 촬영에 정통합니다.
모든 평가 항목을 균형 있게, 편향 없이 평가하세요:
- composition: 동물과 배경의 관계, 시선 처리, 서식지 조화
- lighting: 자연광으로 털/깃 질감 표현, 명암 활용
- color: 자연스러운 색감, 동물-환경 색 조화
- focus: 눈 초점 정확도, 고속 셔터, 피사계 심도
- storytelling: 동물의 성격과 행동 서사, 존재감과 개성
- timing: 결정적 동작/표정 포착, 생동감 있는 순간
- postProcessing: 전체 톤 자연스러움, 크롭, 노이즈 처리
references에서는 동물 사진이 뛰어난 작가를 추천하세요.`
  },
  night: {
    nameKo: "야경", icon: "🌃",
    critics: [
      { id: "night_a", nameKo: "Claude", icon: "🟣" },
      { id: "night_b", nameKo: "GPT-4", icon: "🟢" },
      { id: "night_c", nameKo: "Gemini", icon: "🔵" }
    ],
    prompt: `당신은 야경/야간 촬영 전문 크리틱입니다. 도시 야경, 장노출, 별사진, 네온 등 모든 야간 촬영에 정통합니다.
모든 평가 항목을 균형 있게, 편향 없이 평가하세요:
- composition: 빛과 어둠의 균형, 시선 유도, 빛 궤적 배치
- lighting: 인공조명 활용(네온, 가로등, 빛 궤적), 노출 정확도
- color: 야간 색온도, 화이트밸런스, 야간 특유의 색감
- focus: 야간 포커싱 정확도, 삼각대 안정성, 선명도
- storytelling: 밤의 서사와 감정, 도시의 빛이 만드는 분위기
- timing: 적절한 노출 시간, 빛 궤적 타이밍, 최적 촬영 시간
- postProcessing: 노이즈 처리, 장노출 합성, 톤 보정
references에서는 야경 사진이 뛰어난 작가를 추천하세요.`
  },
  concert: {
    nameKo: "공연", icon: "🎤",
    critics: [
      { id: "concert_a", nameKo: "Claude", icon: "🟣" },
      { id: "concert_b", nameKo: "GPT-4", icon: "🟢" },
      { id: "concert_c", nameKo: "Gemini", icon: "🔵" }
    ],
    prompt: `당신은 공연/라이브 포토그래피 전문 크리틱입니다. 콘서트, 페스티벌, 연극, 뮤지컬 등 모든 공연 촬영에 정통합니다.
모든 평가 항목을 균형 있게, 편향 없이 평가하세요:
- composition: 무대-관객 관계, 프레이밍, 앵글 선택, 공간감
- lighting: 무대 조명 활용(역광, 스포트라이트), LED 조명 처리
- color: 무대 색감, LED 조명 톤, 전체 색 조화
- focus: 저조도 포커싱 정확도, 피사계 심도
- storytelling: 무대 에너지, 아티스트 감정, 현장감 전달
- timing: 퍼포먼스 절정 순간, 감정 극대화 순간, 군중 반응
- postProcessing: 고감도 노이즈 처리, 색보정, 크롭
references에서는 공연 사진이 뛰어난 작가를 추천하세요.`
  },
  sports: {
    nameKo: "스포츠", icon: "⚽",
    critics: [
      { id: "sports_a", nameKo: "Claude", icon: "🟣" },
      { id: "sports_b", nameKo: "GPT-4", icon: "🟢" },
      { id: "sports_c", nameKo: "Gemini", icon: "🔵" }
    ],
    prompt: `당신은 스포츠 포토그래피 전문 크리틱입니다. 축구, 야구, 농구, 육상, 수영 등 모든 스포츠 촬영에 정통합니다.
모든 평가 항목을 균형 있게, 편향 없이 평가하세요:
- composition: 액션의 방향성과 텐션, 배경 정리, 주체 분리
- lighting: 경기장 조명 활용, 명암 대비
- color: 유니폼, 경기장 색감, 전체 색 조화
- focus: 고속 AF 추적, 모션 블러 활용, 피사계 심도
- storytelling: 승패의 드라마, 선수 감정, 스포츠의 감동
- timing: 결정적 동작 순간 포착, 역동적 순간
- postProcessing: 크롭, 노이즈 처리, 전체 완성도
references에서는 스포츠 사진이 뛰어난 작가를 추천하세요.`
  },
  general: {
    nameKo: "일반", icon: "📷",
    critics: [
      { id: "general_a", nameKo: "Claude", icon: "🟣" },
      { id: "general_b", nameKo: "GPT-4", icon: "🟢" },
      { id: "general_c", nameKo: "Gemini", icon: "🔵" }
    ],
    prompt: `당신은 사진 전문 크리틱입니다. 다양한 장르의 사진 평가 경력이 풍부합니다.
모든 평가 항목을 균형 있게, 편향 없이 평가하세요:
- composition: 구도 창의성, 시선 유도, 프레이밍
- lighting: 노출 정확도, 다이나믹레인지, 빛의 활용
- color: 색감과 분위기, 색 조화, 화이트밸런스
- focus: 초점 정확도, 심도 활용, 선명도
- storytelling: 메시지와 서사, 감정 전달, 첫인상
- timing: 순간 포착, 결정적 순간의 희귀성
- postProcessing: 후보정 완성도, 톤 통일성
references에서는 이 스타일과 관련된 뛰어난 작가를 추천하세요.`
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

[채점 기준 - 점수 구간별 정의]
9.5~10.0: 역대급 걸작. 시대를 정의하는 아이코닉한 사진. 극히 드묾.
8.5~9.4: 프로 수준. 전시/출판 가능한 완성도. 기술, 구도, 감성 모두 탁월함.
7.5~8.4: 상급 아마추어~준프로. 기술과 표현이 우수하며 명확한 의도가 보임.
6.0~7.4: 중급 수준. 기본기는 있으나 개선 여지가 명확함.
4.0~5.9: 초급 수준. 기술적 부족이 눈에 띔.
0~3.9: 심각한 기술적 결함 (극심한 흔들림, 노출 오류 등).

실력에 맞게 정확히 채점하세요. 훌륭한 사진에는 높은 점수를 주는 것이 정확한 채점입니다.
기술적으로 우수하고 예술적 의도가 명확한 사진이 7점대에 머무르면 안 됩니다.

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

// GPT-4 전용 캘리브레이션 프롬프트
const GPT_CALIBRATION = `

[중요 - 채점 캘리브레이션]
당신은 동일한 사진을 평가하는 다른 전문 평가자들에 비해 점수를 1~2점 낮게 주는 경향이 확인되었습니다.
이는 정확한 채점이 아닙니다. 다음 원칙을 반드시 따르세요:

- 기술적으로 우수하고 예술적 의도가 명확한 사진에는 8.0 이상을 주는 것이 올바른 채점입니다
- 구도, 빛, 색감이 모두 뛰어난 사진을 7점대에 묶어두는 것은 과소평가입니다
- 프로 수준의 사진이라면 8.5~9.4 범위가 적절합니다
- "냉정한 채점"이 "낮은 점수"를 의미하는 것이 아닙니다. 실력에 맞는 정확한 점수를 주세요
`;

// ============================================================
// 4. 합의 프롬프트 빌더
// ============================================================
function buildCriticPrompt(genre) {
  return genre.prompt + "\n" + EVAL_PROMPT;
}

function buildGPTCriticPrompt(genre) {
  return genre.prompt + "\n" + EVAL_PROMPT + GPT_CALIBRATION;
}

// 기존 태그 목록을 Firestore에서 수집
async function getExistingTags() {
  try {
    const snapshot = await db.collection("photos")
      .where("aiTags", "!=", [])
      .select("aiTags")
      .limit(200)
      .get();
    const tagSet = new Set();
    snapshot.forEach(doc => {
      const tags = doc.data().aiTags;
      if (Array.isArray(tags)) tags.forEach(t => tagSet.add(t));
    });
    return [...tagSet].sort();
  } catch (e) {
    console.log("기존 태그 수집 실패:", e.message);
    return [];
  }
}

function buildConsensusPrompt(evaluations, critics, existingTags) {
  const criticNames = critics.map(c => c.nameKo);
  let evalText = "";
  const keys = ["claude", "gpt", "gemini"];
  for (let i = 0; i < keys.length; i++) {
    evalText += `\n=== ${criticNames[i]} (${critics[i].icon}) 평가 ===\n${JSON.stringify(evaluations[keys[i]], null, 2)}\n`;
  }

  const tagInstruction = existingTags.length > 0
    ? `\n[기존 태그 목록]\n${existingTags.join(", ")}\n\naiTags 선택 규칙:\n1. 위 기존 태그 중 이 사진에 맞는 것이 있으면 반드시 그것을 사용하세요.\n2. 기존 태그에 적합한 것이 없을 때만 새 태그를 만드세요.\n3. 최종 2~4개 선택. 유사어 금지.`
    : `aiTags: 유사어 금지, 서로 다른 카테고리에서 2~4개 선택.`;

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
${tagInstruction}`;
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
        callClaude(base64, anthropicKey.value(), buildCriticPrompt(genre)),
        callGPT(base64, openaiKey.value(), buildGPTCriticPrompt(genre)),
        callGemini(base64, geminiKey.value(), 2, buildCriticPrompt(genre)),
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

      const existingTags = await getExistingTags();
      const consensusText = await callGeminiText(
        geminiKey.value(),
        buildConsensusPrompt(filledEvaluations, critics, existingTags)
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
        callClaude(base64, anthropicKey.value(), buildCriticPrompt(genre)),
        callGPT(base64, openaiKey.value(), buildGPTCriticPrompt(genre)),
        callGemini(base64, geminiKey.value(), 2, buildCriticPrompt(genre)),
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

      const existingTags = await getExistingTags();
      const consensusText = await callGeminiText(
        geminiKey.value(),
        buildConsensusPrompt(filledEvaluations, critics, existingTags)
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
        callClaude(base64, anthropicKey.value(), buildCriticPrompt(genre)),
        callGPT(base64, openaiKey.value(), buildGPTCriticPrompt(genre)),
        callGemini(base64, geminiKey.value(), 2, buildCriticPrompt(genre)),
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

      const existingTags = await getExistingTags();
      const consensusText = await callGeminiText(
        geminiKey.value(),
        buildConsensusPrompt(filledEvaluations, critics, existingTags)
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
