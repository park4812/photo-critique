// Sample data matching Firestore schema
// Collection: photos
export const samplePhotos = [
  {
    id: "1",
    title: "駒込食堂",
    category: "거리/상점 외관",
    location: "도쿄",
    date: "2026-03-20",
    imageUrl: "https://images.unsplash.com/photo-1554797589-7241bb691973?w=800",
    thumbnailUrl: "https://images.unsplash.com/photo-1554797589-7241bb691973?w=400",
    scores: {
      composition: 8.5,    // 구도
      lighting: 8.0,       // 노출/빛
      color: 7.5,          // 색감
      focus: 7.0,          // 초점/심도
      storytelling: 8.5,   // 스토리텔링
      timing: 7.0,         // 타이밍
      postProcessing: 6.5  // 후보정 완성도
    },
    totalScore: 8.0,
    critique: {
      summary: "이 시리즈 중 가장 완성도 높은 컷. 따뜻한 빛과 어둠의 대비, 안정적인 프레이밍, 이야기가 있다.",
      strengths: [
        "따뜻한 실내 조명이 밤의 어둠 속에서 자연스럽게 시선을 끌고 있음",
        "열린 문을 통해 안과 밖의 대비가 스토리를 만들어냄",
        "프레이밍이 안정적이고 불필요한 요소가 없음"
      ],
      improvements: [
        "간판 위쪽 건물 부분이 다소 많이 포함되어 있어 살짝 크롭하면 더 타이트한 구성이 될 수 있음"
      ],
      technicalNotes: "야간 촬영에서 실내 조명을 기준으로 노출을 잡은 것이 효과적. 빛이 닿는 곳이 곧 주인공이 되는 좋은 예시."
    },
    tags: ["야간", "식당", "스트릿"]
  },
  {
    id: "2",
    title: "しもふり 상점가",
    category: "골목/거리 풍경",
    location: "도쿄",
    date: "2026-03-20",
    imageUrl: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=800",
    thumbnailUrl: "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=400",
    scores: {
      composition: 8.0,
      lighting: 7.0,
      color: 7.5,
      focus: 7.0,
      storytelling: 7.5,
      timing: 8.0,
      postProcessing: 6.5
    },
    totalScore: 7.5,
    critique: {
      summary: "아치가 자연스러운 프레임 역할을 하고, 그 아래로 걸어가는 사람들이 스케일감을 준다.",
      strengths: [
        "아치 구조물이 천연 프레임으로 작동하여 시선을 안쪽으로 유도",
        "보행자들이 적절한 위치에 있어 스케일감과 생동감을 더함",
        "오른쪽 빨간 보행 신호등이 색 포인트로 잘 작동"
      ],
      improvements: [
        "전체적으로 약간 어두운 편이라 아치 내부의 디테일이 조금 더 보였으면 좋겠음"
      ],
      technicalNotes: "프레임 안의 프레임 기법을 자연스럽게 활용한 좋은 사례."
    },
    tags: ["야간", "상점가", "스트릿"]
  },
  {
    id: "3",
    title: "KAMIKIRIMUSHI 미용실",
    category: "거리/상점 외관",
    location: "도쿄",
    date: "2026-03-20",
    imageUrl: "https://images.unsplash.com/photo-1480796927426-f609979314bd?w=800",
    thumbnailUrl: "https://images.unsplash.com/photo-1480796927426-f609979314bd?w=400",
    scores: {
      composition: 7.0,
      lighting: 6.5,
      color: 8.0,
      focus: 7.0,
      storytelling: 7.5,
      timing: 6.0,
      postProcessing: 6.0
    },
    totalScore: 7.0,
    critique: {
      summary: "피사체 선택이 탁월. 거대한 가위 조형물과 이발소 줄무늬, 노란색 포인트까지 강렬한 비주얼.",
      strengths: [
        "건물 자체의 디자인이 강렬해서 피사체 선택이 좋음",
        "노란색과 이발소 줄무늬의 색 대비가 효과적",
        "글자 'KAMIKIRIMUSHI'가 읽히는 각도"
      ],
      improvements: [
        "정면 촬영이라 다소 평면적. 살짝 비스듬한 각도에서 찍었으면 건물의 입체감이 더 살았을 것",
        "가위 조형물의 상단이 살짝 잘려 완전한 형태를 보여주지 못함"
      ],
      technicalNotes: "건축/간판 사진에서는 약간의 앵글 변화가 입체감에 큰 차이를 만든다."
    },
    tags: ["야간", "건축", "미용실"]
  },
  {
    id: "4",
    title: "지지 인형과 술병",
    category: "정물/디테일",
    location: "도쿄",
    date: "2026-03-20",
    imageUrl: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800",
    thumbnailUrl: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400",
    scores: {
      composition: 7.5,
      lighting: 7.0,
      color: 8.0,
      focus: 7.5,
      storytelling: 8.0,
      timing: 6.5,
      postProcessing: 6.5
    },
    totalScore: 7.5,
    critique: {
      summary: "간스케(肝助) 광고 깃발, 소주병, 검은 고양이 인형의 조합이 일본 선술집의 느낌을 압축해서 보여준다.",
      strengths: [
        "일본 선술집의 분위기를 소품들의 조합으로 잘 압축",
        "지지 인형이 시선을 끄는 포인트 역할을 확실히 함",
        "심도가 적절해서 배경 병들이 자연스럽게 보케 처리됨"
      ],
      improvements: [
        "왼쪽 소주병 라벨의 텍스트가 살짝 더 읽혔으면 장소감이 더 강해졌을 것"
      ],
      technicalNotes: "정물 사진에서 '이야기가 있는 배치'를 포착한 좋은 예시. 인형이 주인공, 나머지가 맥락을 제공."
    },
    tags: ["정물", "선술집", "캐릭터"]
  },
  {
    id: "5",
    title: "야끼교자",
    category: "음식",
    location: "도쿄",
    date: "2026-03-20",
    imageUrl: "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=800",
    thumbnailUrl: "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=400",
    scores: {
      composition: 7.5,
      lighting: 6.0,
      color: 6.5,
      focus: 7.0,
      storytelling: 6.5,
      timing: 7.0,
      postProcessing: 6.0
    },
    totalScore: 7.0,
    critique: {
      summary: "크롭 후 교자 자체에 집중시킨 게 효과적. 구운 면의 바삭한 질감과 기름기 반짝임이 잘 보인다.",
      strengths: [
        "접시와 거의 수평에 가까운 낮은 앵글에서 찍어서 교자의 볼록한 형태가 살아남",
        "얕은 심도 덕에 뒤쪽 교자가 자연스럽게 빠지면서 입체감 생성",
        "구운 면의 바삭한 질감이 잘 표현됨"
      ],
      improvements: [
        "조명이 평탄해서 질감이 더 살 수 있었음. 사이드 라이팅이었으면 그림자가 생겨 더 입체적",
        "색온도가 약간 차가운 편"
      ],
      technicalNotes: "음식 사진에서 앵글이 맛있어 보이는 정도를 결정한다. 이 낮은 앵글을 다른 음식 촬영에도 적용할 것."
    },
    tags: ["음식", "교자", "이자카야"]
  },
  {
    id: "6",
    title: "연어 정식",
    category: "음식",
    location: "도쿄",
    date: "2026-03-20",
    imageUrl: "https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?w=800",
    thumbnailUrl: "https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?w=400",
    scores: {
      composition: 6.0,
      lighting: 5.0,
      color: 5.5,
      focus: 4.5,
      storytelling: 6.0,
      timing: 5.5,
      postProcessing: 5.0
    },
    totalScore: 5.5,
    critique: {
      summary: "크롭으로 검은 쟁반 위 배치의 미학이 보이기 시작했지만 초점 문제가 남아있다.",
      strengths: [
        "크롭 후 검은 쟁반과 흰 그릇들의 대비가 살아남",
        "일본 정식 특유의 배치의 미학이 느껴짐"
      ],
      improvements: [
        "초점이 앞쪽 나물 접시에 맞아 있는데 시선은 연어로 감 — 주인공이 아웃포커스 상태",
        "앵글이 너무 높아서 입체감 부족. 30도 정도 낮춰서 접시 높이에서 찍으면 밥알의 윤기나 생선의 굽기가 살아날 것",
        "위에서 내려오는 평탄한 조명이라 질감이 살지 않음"
      ],
      technicalNotes: "음식 사진의 3요소: 빛의 방향, 앵글, 초점. 세 가지 모두 개선 여지가 있다."
    },
    tags: ["음식", "정식", "연어"]
  },
  {
    id: "7",
    title: "전화부스",
    category: "정물/디테일",
    location: "도쿄",
    date: "2026-03-20",
    imageUrl: "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800",
    thumbnailUrl: "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=400",
    scores: {
      composition: 7.5,
      lighting: 7.0,
      color: 8.5,
      focus: 7.0,
      storytelling: 7.0,
      timing: 6.5,
      postProcessing: 6.5
    },
    totalScore: 7.5,
    critique: {
      summary: "색 조합이 훌륭. 핑크 간판, 초록 전화기, 빨간 코카콜라, 청록 야마토 택배함의 조화.",
      strengths: [
        "핑크, 초록, 빨강, 청록의 색채 구성이 자연스러우면서도 풍부함",
        "일본 거리의 레트로한 요소들이 한 프레임에 잘 모여있음",
        "공중전화라는 사라져가는 피사체의 기록적 가치"
      ],
      improvements: [
        "구도가 약간 평면적. 살짝 앵글을 틀어 깊이감을 더했으면 좋겠음"
      ],
      technicalNotes: "색감이 강한 피사체가 모여있을 때 그것만으로도 사진이 성립한다는 좋은 예시."
    },
    tags: ["야간", "레트로", "전화부스"]
  },
  {
    id: "8",
    title: "밤 골목 (가로등)",
    category: "골목/거리 풍경",
    location: "도쿄",
    date: "2026-03-20",
    imageUrl: "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=800",
    thumbnailUrl: "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=400",
    scores: {
      composition: 7.0,
      lighting: 6.5,
      color: 5.5,
      focus: 6.0,
      storytelling: 7.0,
      timing: 5.5,
      postProcessing: 5.0
    },
    totalScore: 6.0,
    critique: {
      summary: "분위기는 가장 강하지만 사진으로서 정보가 너무 적어 '분위기 사진' 이상으로 가기 어렵다.",
      strengths: [
        "고독하고 조용한 밤의 정서가 잘 담김",
        "소실점으로 이어지는 가로등 빛의 배치가 깊이감을 줌"
      ],
      improvements: [
        "전체적으로 너무 어두워 디테일 손실이 큼",
        "하이라이트(가로등)와 섀도우(건물)의 차이가 너무 극단적",
        "노출을 살짝 올리거나 후보정에서 섀도우를 복구하면 건물의 질감이 살아날 것"
      ],
      technicalNotes: "무드 사진도 최소한의 디테일은 유지해야 한다. 완전한 검정은 '분위기'가 아니라 '정보 부재'가 된다."
    },
    tags: ["야간", "골목", "무드"]
  },
  {
    id: "9",
    title: "스타 卓球 거리",
    category: "골목/거리 풍경",
    location: "도쿄",
    date: "2026-03-20",
    imageUrl: "https://images.unsplash.com/photo-1551641506-ee5bf4cb45f1?w=800",
    thumbnailUrl: "https://images.unsplash.com/photo-1551641506-ee5bf4cb45f1?w=400",
    scores: {
      composition: 6.5,
      lighting: 6.5,
      color: 6.5,
      focus: 6.5,
      storytelling: 6.5,
      timing: 6.0,
      postProcessing: 5.5
    },
    totalScore: 6.5,
    critique: {
      summary: "소실점으로 빨려 들어가는 느낌이 강해서 깊이감은 좋지만 좌우 밸런스가 무너져 있다.",
      strengths: [
        "도로가 소실점으로 이어지는 구도가 깊이감을 줌",
        "왼쪽 간판들의 빛이 어두운 거리와 대비를 이룸"
      ],
      improvements: [
        "왼쪽 간판과 오른쪽 어둠의 비중 차이가 커서 밸런스가 불안정",
        "오른쪽에 어떤 요소가 하나 더 있었으면 균형이 잡혔을 것"
      ],
      technicalNotes: "좌우 비대칭 구도는 의도적일 때 강력하지만, 한쪽이 완전히 비면 불균형으로 읽힌다."
    },
    tags: ["야간", "거리", "소실점"]
  },
  {
    id: "10",
    title: "식당 내부 칠판",
    category: "실내/다큐멘터리",
    location: "도쿄",
    date: "2026-03-20",
    imageUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800",
    thumbnailUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400",
    scores: {
      composition: 4.5,
      lighting: 5.0,
      color: 5.5,
      focus: 5.0,
      storytelling: 5.0,
      timing: 4.0,
      postProcessing: 4.0
    },
    totalScore: 4.5,
    critique: {
      summary: "의도가 모호하고 요소가 많은데 시선을 이끄는 주인공이 없어 산만하다.",
      strengths: [
        "식당의 일상적인 분위기를 기록하려는 시도 자체는 좋음",
        "오래된 사진 액자와 시계가 시간의 층위를 보여줌"
      ],
      improvements: [
        "시계, 메뉴판, 주방, 액자 — 요소가 너무 많아 시선이 분산됨",
        "한 발짝 더 다가가서 칠판 메뉴와 오래된 사진 액자만 타이트하게 잡았으면 이야기가 더 선명했을 것",
        "주방 쪽 형광등과 식당 쪽 백열등의 색온도가 섞여 있어 색감이 혼란스러움"
      ],
      technicalNotes: "실내 촬영에서는 '빼기의 미학'이 중요하다. 프레임에 넣을 것보다 뺄 것을 먼저 생각할 것."
    },
    tags: ["실내", "식당", "메뉴"]
  },
  {
    id: "11",
    title: "편의점 내부",
    category: "실내/다큐멘터리",
    location: "도쿄",
    date: "2026-03-20",
    imageUrl: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800",
    thumbnailUrl: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400",
    scores: {
      composition: 5.0,
      lighting: 4.5,
      color: 5.0,
      focus: 3.5,
      storytelling: 5.0,
      timing: 4.5,
      postProcessing: 3.5
    },
    totalScore: 4.0,
    critique: {
      summary: "흥미로운 시도지만 초점이 어디에도 맞지 않아 의도적 보케가 아닌 실수로 보인다.",
      strengths: [
        "편의점이라는 일상 공간을 피사체로 본 시각 자체는 흥미로움",
        "좁은 통로의 원근감이 있음"
      ],
      improvements: [
        "초점이 인물에도, 선반에도 정확히 맞지 않아 의도가 불분명",
        "인물을 주제로 잡을 거면 확실히 인물에 포커스를, 아니면 선반의 색감에 맞추고 사람을 실루엣으로 처리할 것",
        "형광등 조명이 밋밋해서 평면적으로 보임"
      ],
      technicalNotes: "어떤 사진이든 '어디에 초점을 맞출 것인가'는 최소한의 의사 결정이다. 이것이 빠지면 사진이 방황한다."
    },
    tags: ["실내", "편의점", "일상"]
  },
  {
    id: "12",
    title: "TajMahal 식당",
    category: "거리/상점 외관",
    location: "도쿄",
    date: "2026-03-20",
    imageUrl: "https://images.unsplash.com/photo-1565402170291-8491f14678db?w=800",
    thumbnailUrl: "https://images.unsplash.com/photo-1565402170291-8491f14678db?w=400",
    scores: {
      composition: 4.5,
      lighting: 3.5,
      color: 5.0,
      focus: 5.0,
      storytelling: 4.0,
      timing: 4.0,
      postProcessing: 3.5
    },
    totalScore: 4.0,
    critique: {
      summary: "너무 어두워서 간판 주변 외에는 거의 정보가 없다. '어둠 속 간판' 이상의 이야기가 전달되지 않는다.",
      strengths: [
        "이국적인 식당이 일본 주택가에 있는 대비는 흥미로운 소재"
      ],
      improvements: [
        "노출을 살짝 올리거나 과감하게 간판만 크롭해서 네온 느낌을 강조하는 게 나았을 것",
        "오른쪽 너구리 조명이 귀여운 포인트인데 너무 작게 잡혀 있음",
        "전체적으로 정보가 부족해 무엇을 말하고 싶은지 불분명"
      ],
      technicalNotes: "야간 촬영에서 노출 부족은 '분위기'가 아니라 '실패'가 될 수 있다. 적정 노출을 기준으로 의도적으로 언더를 줄 것."
    },
    tags: ["야간", "식당", "인도요리"]
  }
];

// Score label mapping
export const scoreLabels = {
  composition: { ko: "구도", en: "Composition", icon: "📐" },
  lighting: { ko: "노출/빛", en: "Lighting", icon: "💡" },
  color: { ko: "색감", en: "Color", icon: "🎨" },
  focus: { ko: "초점/심도", en: "Focus", icon: "🔍" },
  storytelling: { ko: "스토리텔링", en: "Storytelling", icon: "📖" },
  timing: { ko: "타이밍", en: "Timing", icon: "⏱" },
  postProcessing: { ko: "후보정", en: "Post-processing", icon: "🖥" }
};

// Categories for filtering
export const categories = [
  "전체",
  "거리/상점 외관",
  "골목/거리 풍경",
  "정물/디테일",
  "음식",
  "실내/다큐멘터리"
];
