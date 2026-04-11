const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const sharp = require("sharp");

admin.initializeApp();

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
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
당신은 세계적인 사진 공모전의 심사위원입니다.
엄격하고 정확하게 채점하세요. 점수 범위 1~10을 전체적으로 활용해야 합니다.

[절대 점수 기준 - 반드시 이 기준에 따라 채점]
9.0~10.0: 세계적 걸작. Ansel Adams, Steve McCurry급. 기술+예술+감동 모두 완벽. 100장 중 1장.
7.5~8.9: 뛰어난 작품. 국제 공모전 입상급. 의도와 실행이 모두 높은 수준이나 걸작에는 못 미침.
6.0~7.4: 좋은 작품. 기본기가 탄탄하고 의도가 보이는 숙련된 사진. 사진 동호회 우수작 수준.
4.5~5.9: 평범. 기본기는 있으나 특별한 점이 없거나, 한두 가지 아쉬운 점이 있음.
3.0~4.4: 미흡. 구도/빛/초점 등에 문제가 보이거나, 의도가 불분명한 사진.
1.0~2.9: 부족. 기술적 결함이 심하고, 사진으로서 가치가 낮음.

[카테고리별 채점 루브릭]
각 항목별로 아래 기준에 따라 정확히 채점하세요:

★ composition (구도):
  9-10: 삼분법/리딩라인/전경-후경 모두 완벽. 의도적이고 독창적인 프레이밍.
  7-8: 좋은 구도. 기본 원칙을 잘 활용하나, 한 요소가 아쉽거나 더 나을 수 있음.
  5-6: 평범한 구도. 중앙배치이거나 특별한 의도 없이 찍은 느낌.
  3-4: 구도가 어색하거나 주체가 불분명. 불필요한 요소가 많음.
  1-2: 구도 의식이 전혀 없음.

★ lighting (조명):
  9-10: 빛의 방향/질감/강도를 완벽히 활용. 골든아워, 드라마틱 라이팅 등 의도적 제어.
  7-8: 좋은 빛 활용. 하이라이트/섀도우 디테일 잘 보존. 약간의 아쉬움.
  5-6: 자연광을 그냥 받은 수준. 노출은 맞으나 빛의 의도적 활용은 없음.
  3-4: 노출 과다/부족이 보이거나, 빛의 방향이 좋지 않음.
  1-2: 노출이 심각하게 틀림. 역광 실패 등.

★ color (색감):
  9-10: 색감의 하모니가 완벽. 의도적인 톤/무드가 분명. 색이 감정을 전달.
  7-8: 좋은 색감. 화이트밸런스 정확하고 색 조화가 있으나 특별함은 부족.
  5-6: 카메라 기본 색감 수준. 나쁘지 않으나 의도적 색감 연출은 없음.
  3-4: 색감이 부자연스럽거나, 화이트밸런스 오류가 보임.
  1-2: 색 재현이 심각하게 틀림.

★ focus (초점):
  9-10: 초점이 완벽하고, 피사계심도 선택이 의도적. 보케가 아름다움.
  7-8: 초점 정확. 심도 선택 적절. 약간의 소프트함이 있을 수 있음.
  5-6: 초점은 맞으나 심도 활용이 평범. 특별한 의도 없음.
  3-4: 초점이 약간 빗나감. 의도하지 않은 부분에 포커스.
  1-2: 초점 실패. 전체적으로 흐림.

★ storytelling (이야기):
  9-10: 사진 한 장으로 강한 감정/서사를 전달. 보는 순간 이야기가 느껴짐.
  7-8: 분위기나 감정이 느껴지나, 서사의 깊이가 걸작에는 못 미침.
  5-6: 어떤 느낌은 있으나 명확한 이야기나 감정 전달은 약함.
  3-4: 특별한 이야기나 감정이 없음. 단순 기록 사진.
  1-2: 아무 의미도 느껴지지 않음.

★ timing (타이밍):
  9-10: 결정적 순간 완벽 포착. 이 빛, 이 순간이 아니면 불가능한 사진.
  7-8: 좋은 타이밍. 적절한 시간대에 촬영했으나 극적이지는 않음.
  5-6: 타이밍에 특별함 없음. 언제든 찍을 수 있는 장면.
  3-4: 좀 더 기다렸으면 좋았을 순간. 시간대 선택이 아쉬움.
  1-2: 완전히 잘못된 타이밍.

★ postProcessing (후처리):
  9-10: 후처리가 완벽하게 사진의 의도를 강화. 과하지도 부족하지도 않음.
  7-8: 적절한 후처리. 톤과 색감이 잘 다듬어짐. 약간의 개선 여지.
  5-6: 기본적인 후처리만 됨. 또는 후처리 없이 카메라 출력 그대로.
  3-4: 후처리가 과하거나 부족. HDR 과도, 채도 과다 등.
  1-2: 후처리 실패. 인위적이고 부자연스러움.

[점수 분산 필수]
- 7개 항목의 최고점과 최저점 차이가 반드시 3점 이상이어야 합니다.
- 강점은 과감히 높게(8-9), 약점은 과감히 낮게(3-5) 주세요.
- 모든 항목에 6~7점을 주는 것은 금지입니다. 그건 평가가 아닙니다.
- 걸작과 좋은 사진은 반드시 평균 1.5점 이상 차이가 나야 합니다.

[결함 분석]
기술적 결함을 찾되, 전체 인상에 미치는 영향을 고려:
- 사소한 결함(미세한 노이즈, 약간의 색수차)은 점수에 큰 영향 없음
- 중요한 결함(초점 실패, 심한 노출 오류)은 점수에 큰 영향
- 예술적 의도가 분명한 "기술적 파격"(의도적 블러, 하이키/로우키)은 결함이 아님

반드시 아래 JSON 형식으로만 응답하세요:
{
  "defectsFound": ["결함1: 구체적 설명", "결함2: 구체적 설명"],
  "defectCount": 0,
  "scoreUpperLimit": 10.0,
  "excellenceFound": ["우수점1: 설명"],
  "percentileEstimate": "상위 X%",
  "scores": {
    "composition": 7.5,
    "lighting": 8.0,
    "color": 6.5,
    "focus": 7.0,
    "storytelling": 4.5,
    "timing": 5.0,
    "postProcessing": 6.0
  },
  "critique": {
    "summary": "한두 문장의 전체 요약",
    "strengths": ["강점1", "강점2"],
    "improvements": ["개선점1", "개선점2"],
    "technicalNotes": "기술적 조언"
  },
  "references": [
    {"photographer": "작가 이름", "work": "작품 또는 시리즈명", "reason": "참고 포인트"}
  ],
  "aiTags": ["태그1", "태그2"]
}

[필수] 결함을 먼저 모두 나열하고, scoreUpperLimit을 정한 뒤, 그 안에서 채점하세요.
위 예시 점수는 참고용이며, 카테고리별 루브릭에 따라 반드시 조정하세요.
모든 점수가 scoreUpperLimit을 초과하면 안 됩니다.
references: 이 사진 스타일 관련 유명 사진작가 2~3명 추천.
aiTags: 장르/주제/분위기/스타일 한국어 태그 2~4개. 유사어 금지.`;

// GPT-4 전용 캘리브레이션 프롬프트
const GPT_CALIBRATION = `

[GPT 채점 유의사항]
당신은 점수를 높게 주는 경향이 있습니다. 다음을 유의하세요:
1. 평범한 사진에 8점 이상을 주지 마세요. 8점 이상은 정말 뛰어난 사진에만 해당합니다.
2. 부족한 점이 보이면 과감하게 4~5점을 주세요. 낮은 점수를 두려워하지 마세요.
3. storytelling: 명확한 서사나 감정이 없으면 5점 이하로 주세요.
4. 강점과 약점의 차이를 크게 벌려주세요.
`;

// ============================================================
// 4. 합의 프롬프트 빌더
// Claude/Gemini 캘리브레이션
const GENERAL_CALIBRATION = `

[채점 유의사항]
- 강점과 약점을 명확히 구분하세요. 모든 항목에 비슷한 점수를 주지 마세요.
- storytelling: 명확한 서사나 감정이 없으면 5점 이하.
- timing: 결정적 순간이 아니면 5점 이하.
- 뛰어난 사진에는 8~9점을 과감히 주세요. 부족한 사진에는 3~4점을 주세요.
`;

// ============================================================
function buildCriticPrompt(genre) {
  return genre.prompt + "\n" + EVAL_PROMPT + GENERAL_CALIBRATION;
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

[합의 진행 규칙]
1. 각 항목별로 3명의 점수 중 중앙값(median)을 기준으로 ±1.5점 이내에서 합의점수를 정하세요.
2. 한 명이 유독 낮거나 높은 점수(이상치)를 줬다면, 나머지 2명의 의견을 따르세요.
3. 2명 이상이 8점 이상을 준 항목은 합의에서도 반드시 8점 이상이어야 합니다.
4. 2명 이상이 5점 이하를 준 항목은 합의에서도 반드시 5점 이하여야 합니다.
5. 최종 점수의 최고점-최저점 차이가 3점 미만이면 다시 검토하세요.
6. 뛰어난 사진에는 높은 합의점수를, 부족한 사진에는 낮은 합의점수를 주세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "discussion": [
    { "speaker": "진행자", "text": "세 전문가의 평가를 검토한 결과..." },
    { "speaker": "${criticNames[0]}", "text": "저는 구도에서..." },
    { "speaker": "${criticNames[1]}", "text": "저도 동의/반박..." },
    { "speaker": "${criticNames[2]}", "text": "종합하면..." },
    { "speaker": "진행자", "text": "합의 결과..." }
  ],
  "finalScores": {
    "composition": 6.5, "lighting": 5.5, "color": 6.0,
    "focus": 6.0, "storytelling": 5.0, "timing": 5.5, "postProcessing": 6.0
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

토론은 3~6개 메시지로, 점수 차이가 큰 항목과 발견된 결함 위주로 논의하세요.
최종 점수는 단순 평균이 아닌 합의 점수입니다.
[핵심] 사진의 기술적 완성도와 예술적 감동을 종합 평가하세요.
예시의 점수는 평범한 사진 기준이며, 실제 분석에 따라 조정하세요.
${tagInstruction}`;
}

// ============================================================
// 5. AI Provider calls
// ============================================================
async function callClaude(base64, apiKey, prompt) {
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2500,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
        { type: "text", text: prompt || EVAL_PROMPT },
      ],
    }],
  });
  const text = message.content[0].text;
  console.log("Claude raw response length:", text.length);
  return parseAIResponse(text);
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
    const result = robustJsonParse(text);
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
      let debateResult;
      try {
        const consensusText = await callGeminiText(
          geminiKey.value(),
          buildConsensusPrompt(filledEvaluations, critics, existingTags)
        );
        debateResult = parseDebateResponse(consensusText);
      } catch (consensusErr) {
        console.warn(`Consensus parsing failed for ${photoId}, using fallback:`, consensusErr.message);
        debateResult = buildFallbackDebateResult(evaluations);
      }

      const hybridScores = computeHybridScores(evaluations, debateResult.finalScores || {});
      // v36: Use median of 3 AI total scores instead of category average
      const aiTotals = [];
      for (const ai of ["claude", "gpt", "gemini"]) {
        if (evaluations[ai] && typeof evaluations[ai].totalScore === "number") {
          aiTotals.push(evaluations[ai].totalScore);
        }
      }
      aiTotals.sort((a, b) => a - b);
      let finalTotal;
      if (aiTotals.length >= 3) {
        finalTotal = Math.round(aiTotals[1] * 10) / 10;
      } else if (aiTotals.length === 2) {
        finalTotal = Math.round(((aiTotals[0] + aiTotals[1]) / 2) * 10) / 10;
      } else if (aiTotals.length === 1) {
        finalTotal = Math.round(aiTotals[0] * 10) / 10;
      } else {
        const hybridValues = Object.values(hybridScores);
        finalTotal = Math.round((hybridValues.reduce((a, b) => a + b, 0) / hybridValues.length) * 10) / 10;
      }

      // Apply defect penalty
      const { penalty, upperLimit } = computeDefectPenalty(evaluations);
      if (upperLimit < 10.0) {
        finalTotal = Math.round(Math.min(finalTotal, amplifyScore(upperLimit)) * 10) / 10;
      }
      if (penalty > 0) {
        finalTotal = Math.round(Math.max(1.0, finalTotal - penalty) * 10) / 10;
      }

      // Apply image quality cap
      let imgQCap = 10.0, imgQReason = "ok";
      try {
        const origFile = bucket.file(filePath);
        const [origBuf] = await origFile.download();
        const qr = await analyzeImageQuality(origBuf);
        imgQCap = qr.cap; imgQReason = qr.reason;
      } catch (qe) { console.warn("[Quality] skip:", qe.message); }
      if (typeof imgQCap === 'number' && imgQCap < 10.0) {
        const prev = finalTotal;
        finalTotal = Math.round(Math.min(finalTotal, imgQCap) * 10) / 10;
        if (finalTotal !== prev) console.log(`[Scoring] ${photoId}: quality cap ${prev}->${finalTotal} (${imgQReason})`);
      }
      console.log(`[Scoring] ${photoId}: final=${finalTotal} penalty=${penalty} upperLimit=${upperLimit} imgQCap=${imgQCap}`);

      // v35: Proportional scaling removed - was distorting individual category scores

      await db.doc(`photos/${photoId}`).update({
        scores: hybridScores,
        totalScore: finalTotal,
        qualityCap: imgQCap,
        qualityReason: imgQReason,
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
      let debateResult;
      try {
        const consensusText = await callGeminiText(
          geminiKey.value(),
          buildConsensusPrompt(filledEvaluations, critics, existingTags)
        );
        debateResult = parseDebateResponse(consensusText);
      } catch (consensusErr) {
        console.warn(`Consensus parsing failed for ${photoId}, using fallback:`, consensusErr.message);
        debateResult = buildFallbackDebateResult(evaluations);
      }

      const hybridScores = computeHybridScores(evaluations, debateResult.finalScores || {});
      // v36: Use median of 3 AI total scores instead of category average
      const aiTotals = [];
      for (const ai of ["claude", "gpt", "gemini"]) {
        if (evaluations[ai] && typeof evaluations[ai].totalScore === "number") {
          aiTotals.push(evaluations[ai].totalScore);
        }
      }
      aiTotals.sort((a, b) => a - b);
      let finalTotal;
      if (aiTotals.length >= 3) {
        finalTotal = Math.round(aiTotals[1] * 10) / 10;
      } else if (aiTotals.length === 2) {
        finalTotal = Math.round(((aiTotals[0] + aiTotals[1]) / 2) * 10) / 10;
      } else if (aiTotals.length === 1) {
        finalTotal = Math.round(aiTotals[0] * 10) / 10;
      } else {
        const hybridValues = Object.values(hybridScores);
        finalTotal = Math.round((hybridValues.reduce((a, b) => a + b, 0) / hybridValues.length) * 10) / 10;
      }

      // Apply defect penalty
      const { penalty, upperLimit } = computeDefectPenalty(evaluations);
      if (upperLimit < 10.0) {
        finalTotal = Math.round(Math.min(finalTotal, amplifyScore(upperLimit)) * 10) / 10;
      }
      if (penalty > 0) {
        finalTotal = Math.round(Math.max(1.0, finalTotal - penalty) * 10) / 10;
      }

      // Apply image quality cap
      let imgQCap = 10.0, imgQReason = "ok";
      try {
        const [origBuf] = await files[0].download();
        const qr = await analyzeImageQuality(origBuf);
        imgQCap = qr.cap; imgQReason = qr.reason;
      } catch (qe) { console.warn("[Quality] skip:", qe.message); }
      if (typeof imgQCap === 'number' && imgQCap < 10.0) {
        const prev = finalTotal;
        finalTotal = Math.round(Math.min(finalTotal, imgQCap) * 10) / 10;
        if (finalTotal !== prev) console.log(`[Scoring] ${photoId}: quality cap ${prev}->${finalTotal} (${imgQReason})`);
      }
      console.log(`[Scoring] ${photoId}: final=${finalTotal} penalty=${penalty} upperLimit=${upperLimit} imgQCap=${imgQCap}`);

      // v35: Proportional scaling removed - was distorting individual category scores

      await db.doc(`photos/${photoId}`).update({
        scores: hybridScores,
        totalScore: finalTotal,
        qualityCap: imgQCap,
        qualityReason: imgQReason,
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

      return { success: true, totalScore: finalTotal, photoType: classification.genre, qualityCap: imgQCap, qualityReason: imgQReason };
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

    await db.doc(`photos/${photoId}`).set({
      aiStatus: "processing",
      debateStatus: "processing",
      debateStartedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

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
      let debateResult;
      try {
        const consensusText = await callGeminiText(
          geminiKey.value(),
          buildConsensusPrompt(filledEvaluations, critics, existingTags)
        );
        debateResult = parseDebateResponse(consensusText);
      } catch (consensusErr) {
        console.warn(`Consensus parsing failed for ${photoId}, using fallback:`, consensusErr.message);
        debateResult = buildFallbackDebateResult(evaluations);
      }

      const hybridScores = computeHybridScores(evaluations, debateResult.finalScores || {});
      // v36: Use median of 3 AI total scores instead of category average
      const aiTotals = [];
      for (const ai of ["claude", "gpt", "gemini"]) {
        if (evaluations[ai] && typeof evaluations[ai].totalScore === "number") {
          aiTotals.push(evaluations[ai].totalScore);
        }
      }
      aiTotals.sort((a, b) => a - b);
      let finalTotal;
      if (aiTotals.length >= 3) {
        finalTotal = Math.round(aiTotals[1] * 10) / 10;
      } else if (aiTotals.length === 2) {
        finalTotal = Math.round(((aiTotals[0] + aiTotals[1]) / 2) * 10) / 10;
      } else if (aiTotals.length === 1) {
        finalTotal = Math.round(aiTotals[0] * 10) / 10;
      } else {
        const hybridValues = Object.values(hybridScores);
        finalTotal = Math.round((hybridValues.reduce((a, b) => a + b, 0) / hybridValues.length) * 10) / 10;
      }

      // Apply defect penalty
      const { penalty, upperLimit } = computeDefectPenalty(evaluations);
      if (upperLimit < 10.0) {
        finalTotal = Math.round(Math.min(finalTotal, amplifyScore(upperLimit)) * 10) / 10;
      }
      if (penalty > 0) {
        finalTotal = Math.round(Math.max(1.0, finalTotal - penalty) * 10) / 10;
      }

      // Apply image quality cap
      let imgQCap = 10.0, imgQReason = "ok";
      try {
        const [origBuf] = await files[0].download();
        const qr = await analyzeImageQuality(origBuf);
        imgQCap = qr.cap; imgQReason = qr.reason;
      } catch (qe) { console.warn("[Quality] skip:", qe.message); }
      if (typeof imgQCap === 'number' && imgQCap < 10.0) {
        const prev = finalTotal;
        finalTotal = Math.round(Math.min(finalTotal, imgQCap) * 10) / 10;
        if (finalTotal !== prev) console.log(`[Scoring] ${photoId}: quality cap ${prev}->${finalTotal} (${imgQReason})`);
      }
      console.log(`[Scoring] ${photoId}: final=${finalTotal} penalty=${penalty} upperLimit=${upperLimit} imgQCap=${imgQCap}`);

      // v35: Proportional scaling removed - was distorting individual category scores

      await db.doc(`photos/${photoId}`).set({
        scores: hybridScores,
        totalScore: finalTotal,
        qualityCap: imgQCap,
        qualityReason: imgQReason,
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
      }, { merge: true });

      return { success: true, totalScore: finalTotal, photoType: classification.genre, qualityCap: imgQCap, qualityReason: imgQReason };
    } catch (error) {
      console.error(`Re-evaluate failed for ${photoId}:`, error);
      await db.doc(`photos/${photoId}`).set({
        aiEvaluated: false,
        aiError: error.message,
        aiStatus: "error",
        debateStatus: "error",
      }, { merge: true });
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
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;
  // Remove all markdown code block wrappers (greedy and non-greedy)
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/i);
  if (codeBlockMatch) cleaned = codeBlockMatch[1];
  else cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  return cleaned.trim();
}

function robustJsonParse(text) {
  if (!text || typeof text !== 'string') throw new Error("Empty text input");
  const cleaned = cleanJsonText(text);

  // Step 1: Find JSON object in cleaned text
  let jsonMatch = cleaned.match(/\{[\s\S]*\}/);

  // If not found in cleaned, try original text (cleanJsonText might have over-stripped)
  if (!jsonMatch) jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    // Last resort: try to extract scores via regex from raw text
    const scoreRegex = /"(composition|lighting|color|focus|storytelling|timing|postProcessing)"\s*:\s*([\d.]+)/g;
    const scores = {};
    let m;
    while ((m = scoreRegex.exec(text)) !== null) {
      scores[m[1]] = parseFloat(m[2]);
    }
    if (Object.keys(scores).length >= 5) {
      return {
        scores,
        critique: { summary: "JSON 파싱 실패, 점수만 추출됨", strengths: [], improvements: [] },
        defectsFound: [], defectCount: 0, scoreUpperLimit: 10,
        excellenceFound: [], percentileEstimate: "N/A",
        references: [], aiTags: []
      };
    }
    // Also try for consensus format (finalScores)
    const fsRegex = /"(composition|lighting|color|focus|storytelling|timing|postProcessing)"\s*:\s*([\d.]+)/g;
    const finalScores = {};
    let fm;
    while ((fm = fsRegex.exec(text)) !== null) {
      finalScores[fm[1]] = parseFloat(fm[2]);
    }
    if (Object.keys(finalScores).length >= 5) {
      return {
        discussion: [{ speaker: "진행자", text: "JSON 파싱 오류로 점수만 추출" }],
        finalScores,
        finalCritique: { summary: "파싱 오류", strengths: [], improvements: [] },
        references: [], aiTags: []
      };
    }
    throw new Error("No JSON object found in response");
  }

  let jsonStr = jsonMatch[0];

  // Try direct parse first
  try { return JSON.parse(jsonStr); } catch (e) { /* continue */ }

  // Fix 1: Replace unescaped control characters inside JSON string values
  // Process character by character to only fix chars inside string literals
  let inString = false;
  let escaped = false;
  let fixed = '';
  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (escaped) { fixed += ch; escaped = false; continue; }
    if (ch === '\\' && inString) { fixed += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; fixed += ch; continue; }
    if (inString) {
      const code = ch.charCodeAt(0);
      if (code < 0x20 || code === 0x7f) {
        if (ch === '\n') fixed += '\\n';
        else if (ch === '\r') fixed += '\\r';
        else if (ch === '\t') fixed += '\\t';
        else fixed += ''; // strip other control chars
        continue;
      }
    }
    fixed += ch;
  }
  try { return JSON.parse(fixed); } catch (e) { /* continue */ }

  // Fix 2: Remove trailing commas
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(fixed); } catch (e) { /* continue */ }

  // Fix 3: Try to extract just the scores object
  const scoresMatch = text.match(/"scores"\s*:\s*\{([^}]+)\}/);
  if (scoresMatch) {
    try {
      const scores = JSON.parse('{' + scoresMatch[1] + '}');
      return {
        scores,
        critique: { summary: "파싱 오류로 점수만 추출됨", strengths: [], improvements: [] },
        defectsFound: [], defectCount: 0, scoreUpperLimit: 10,
        excellenceFound: [], percentileEstimate: "N/A",
        references: [], aiTags: []
      };
    } catch (e) { /* continue */ }
  }

  // Fix 4: Extract individual score values via regex
  const scoreRegex2 = /"(composition|lighting|color|focus|storytelling|timing|postProcessing)"\s*:\s*([\d.]+)/g;
  const regexScores = {};
  let rm;
  while ((rm = scoreRegex2.exec(text)) !== null) {
    regexScores[rm[1]] = parseFloat(rm[2]);
  }
  if (Object.keys(regexScores).length >= 5) {
    return {
      scores: regexScores,
      critique: { summary: "JSON 파싱 실패, 정규식으로 점수 추출", strengths: [], improvements: [] },
      defectsFound: [], defectCount: 0, scoreUpperLimit: 10,
      excellenceFound: [], percentileEstimate: "N/A",
      references: [], aiTags: []
    };
  }

  throw new Error("Failed to parse JSON after all recovery attempts");
}

function parseAIResponse(text) {
  const result = robustJsonParse(text);
  const scores = result.scores;
  const values = Object.values(scores);
  const totalScore = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  return { ...result, totalScore };
}

function parseDebateResponse(text) {
  return robustJsonParse(text);
}

// Fallback: build debateResult from individual AI evaluations when consensus parsing fails
function buildFallbackDebateResult(evaluations) {
  const scoreKeys = ["composition", "lighting", "color", "focus", "storytelling", "timing", "postProcessing"];
  const fallbackScores = {};

  for (const key of scoreKeys) {
    const vals = [];
    for (const ai of ["claude", "gpt", "gemini"]) {
      if (evaluations[ai] && evaluations[ai].scores && typeof evaluations[ai].scores[key] === "number") {
        vals.push(evaluations[ai].scores[key]);
      }
    }
    if (vals.length > 0) {
      vals.sort((a, b) => a - b);
      fallbackScores[key] = vals.length === 3 ? vals[1] : vals.length === 2 ? (vals[0] + vals[1]) / 2 : vals[0];
    } else {
      fallbackScores[key] = 5.0;
    }
  }

  // Gather critiques from individual AIs
  const summaries = [];
  for (const ai of ["claude", "gpt", "gemini"]) {
    if (evaluations[ai] && evaluations[ai].critique && evaluations[ai].critique.summary) {
      summaries.push(evaluations[ai].critique.summary);
    }
  }

  return {
    finalScores: fallbackScores,
    finalCritique: {
      summary: summaries.length > 0 ? summaries[0] : "(합의 파싱 실패 - 개별 AI 점수 중앙값 사용)",
      good: [],
      improve: [],
    },
    discussion: [{ speaker: "진행자", text: "합의 파싱 실패로 개별 AI 점수 중앙값을 사용했습니다." }],
    references: [],
    aiTags: [],
  };
}

// Hybrid scoring: median of individual AI scores (more reliable than consensus alone)
// v35: Identity function - no amplification, display AI debate scores as-is
// Previous versions (v33, v34) inflated scores causing mismatch with AI debate results
function amplifyScore(raw) {
  return Math.round(Math.max(1.0, Math.min(10.0, raw)) * 10) / 10;
}

// Use defectCount and scoreUpperLimit from AI evaluations to penalize bad photos
function computeDefectPenalty(evaluations) {
  const defectCounts = [];
  const upperLimits = [];
  for (const ai of ["claude", "gpt", "gemini"]) {
    if (evaluations[ai]) {
      if (typeof evaluations[ai].defectCount === "number") {
        defectCounts.push(evaluations[ai].defectCount);
      }
      if (typeof evaluations[ai].scoreUpperLimit === "number") {
        upperLimits.push(evaluations[ai].scoreUpperLimit);
      }
    }
  }

  // v26: Use MINIMUM defect count (most lenient AI wins) to avoid over-penalizing good photos
  defectCounts.sort((a, b) => a - b);
  const minDefects = defectCounts.length > 0 ? defectCounts[0] : 0;

  // v28: Skip penalty for 0-3 defects (normal for any photo), reduced severity
  const penalty = minDefects <= 3 ? 0 : Math.min((minDefects - 1) * 0.4, 1.5);

  // Score upper limit: use median of AI-provided limits
  upperLimits.sort((a, b) => a - b);
  const upperLimit = upperLimits.length >= 3 ? upperLimits[1] :
    upperLimits.length === 2 ? Math.min(upperLimits[0], upperLimits[1]) :
    upperLimits.length === 1 ? upperLimits[0] : 10.0;

  return { penalty, upperLimit };
}

function computeHybridScores(evaluations, consensusScores) {
  const scoreKeys = ["composition", "lighting", "color", "focus", "storytelling", "timing", "postProcessing"];
  const hybridScores = {};

  for (const key of scoreKeys) {
    // Collect all individual AI scores for this item
    const individualScores = [];
    for (const ai of ["claude", "gpt", "gemini"]) {
      if (evaluations[ai] && evaluations[ai].scores && typeof evaluations[ai].scores[key] === "number") {
        individualScores.push(evaluations[ai].scores[key]);
      }
    }

    if (individualScores.length === 0) {
      hybridScores[key] = Math.round((consensusScores[key] || 5.0) * 10) / 10;
      continue;
    }

    // Sort for median
    individualScores.sort((a, b) => a - b);
    const median = individualScores.length === 3
      ? individualScores[1]
      : individualScores.length === 2
        ? (individualScores[0] + individualScores[1]) / 2
        : individualScores[0];

    // Hybrid: 60% median of individuals, 40% consensus
    const consensus = consensusScores[key] || median;
    const hybrid = median * 0.6 + consensus * 0.4;

    // Amplify hybrid score to stretch compressed AI range to full 1-10
    hybridScores[key] = amplifyScore(hybrid);
  }

  return hybridScores;
}

// v21: Resolution-aware image quality analysis with calibrated tier caps
async function analyzeImageQuality(jpegBuffer) {
  try {
    const buf = Buffer.isBuffer(jpegBuffer) ? jpegBuffer : Buffer.from(jpegBuffer, "base64");
    const fileSize = buf.length;
    const meta = await sharp(buf).metadata();
    const origW = meta.width || 0, origH = meta.height || 0;
    const origPx = origW * origH;
    const analysisW = Math.min(origW || 500, 500);
    const analysisH = Math.min(origH || 500, 500);
    const grey = sharp(buf).resize(analysisW, analysisH, { fit: "inside" }).greyscale();
    const { info, data: px } = await grey.clone().raw().toBuffer({ resolveWithObject: true });
    const len = px.length;
    const actualW = info.width, actualH = info.height;
    let sum = 0, sumSq = 0, hist = new Array(256).fill(0);
    for (let i = 0; i < len; i++) { sum += px[i]; sumSq += px[i]*px[i]; hist[px[i]]++; }
    const mean = sum/len, vari = (sumSq/len)-(mean*mean), sd = Math.sqrt(Math.max(0,vari));
    let dk = 0, br = 0;
    for (let i = 0; i < 30; i++) dk += hist[i];
    for (let i = 230; i < 256; i++) br += hist[i];
    const dkR = dk/len, brR = br/len;
    // Laplacian variance for blur detection
    let lapSum = 0, lapCount = 0;
    for (let y = 1; y < actualH - 1; y++) {
      for (let x = 1; x < actualW - 1; x++) {
        const idx = y * actualW + x;
        const lap = -4 * px[idx] + px[idx-1] + px[idx+1] + px[idx-actualW] + px[idx+actualW];
        lapSum += lap * lap;
        lapCount++;
      }
    }
    const lapVar = lapCount > 0 ? lapSum / lapCount : 0;
    const bpp = origPx > 0 ? (fileSize * 8) / origPx : 0;
    let reasons = [], cap = 10.0;
    // Brightness checks
    if (mean < 20 || dkR > 0.80) { cap = Math.min(cap, 2.0); reasons.push("nearly_black"); }
    else if (mean < 35 || dkR > 0.65) { cap = Math.min(cap, 3.5); reasons.push("very_dark"); }
    if (mean > 240 || brR > 0.80) { cap = Math.min(cap, 2.0); reasons.push("nearly_white"); }
    else if (mean > 225 || brR > 0.65) { cap = Math.min(cap, 4.0); reasons.push("very_bright"); }
    // Contrast checks
    if (sd < 8) { cap = Math.min(cap, 2.5); reasons.push("no_contrast"); }
    else if (sd < 14) { cap = Math.min(cap, 4.5); reasons.push("low_contrast"); }
    // v24: Quality-aware resolution tiers - use actual quality metrics to modulate caps
    const sharpScore = Math.min(1.0, lapVar / 300);  // 300+ = very sharp
    const compScore = Math.min(1.0, bpp / 1.0);      // 1.0+ bpp = good compression
    const qualityScore = (sharpScore * 0.6) + (compScore * 0.4);  // weighted combo
    if (origPx < 350000) {
      // TIER 1: Low-res < 350K px - quality modulated
      if (qualityScore > 0.7) { cap = Math.min(cap, 6.5); reasons.push("tier1_good_quality"); }
      else if (qualityScore > 0.4) { cap = Math.min(cap, 5.0); reasons.push("tier1_med_quality"); }
      else { cap = Math.min(cap, 3.5); reasons.push("tier1_poor_quality"); }
    } else if (origPx < 1500000) {
      // TIER 2: Medium-res 350K-1.5M px - quality modulated
      if (qualityScore > 0.7) { reasons.push("tier2_good_quality"); }  // NO CAP for good quality
      else if (qualityScore > 0.4) { cap = Math.min(cap, 7.5); reasons.push("tier2_med_quality"); }
      else { cap = Math.min(cap, 5.5); reasons.push("tier2_poor_quality"); }
    } else {
      // TIER 3: High-res >= 1.5M px - minimal caps
      if (qualityScore < 0.2) { cap = Math.min(cap, 6.0); reasons.push("tier3_poor_quality"); }
      else { reasons.push("tier3_hires"); }
    }
    if (origPx > 0 && origPx < 10000) { cap = Math.min(cap, 2.5); reasons.push("tiny_image"); }
    const severeCount = reasons.filter(r => r.includes("severe") || r.includes("nearly") || r.includes("no_contrast")).length;
    if (severeCount >= 2) { cap = Math.min(cap, 2.0); reasons.push("multiple_severe"); }
    const reason = reasons.length > 0 ? reasons.join("+") : "ok";
    console.log(`[ImageQuality] ${origW}x${origH} (${origPx}px) lapVar=${lapVar.toFixed(1)} bpp=${bpp.toFixed(3)} mean=${mean.toFixed(1)} sd=${sd.toFixed(1)} => cap=${cap} reason=${reason}`);
    return { cap, reason };
  } catch (e) {
    console.error("[ImageQuality] Error:", e.message);
    return { cap: 10.0, reason: "error" };
  }
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
