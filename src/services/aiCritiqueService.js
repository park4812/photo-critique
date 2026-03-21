/**
 * AI Photo Critique Service
 *
 * Calls an AI vision model to automatically evaluate photos.
 * Supports Claude (Anthropic) and OpenAI Vision APIs.
 *
 * Usage:
 *   const result = await getAICritique(imageBase64, { provider: 'anthropic' });
 *
 * For production: Move this to a Firebase Cloud Function to protect API keys.
 */

const SCORE_CATEGORIES = [
  { key: 'composition', ko: '구도' },
  { key: 'lighting', ko: '노출/빛' },
  { key: 'color', ko: '색감' },
  { key: 'focus', ko: '초점/심도' },
  { key: 'storytelling', ko: '스토리텔링' },
  { key: 'timing', ko: '타이밍' },
  { key: 'postProcessing', ko: '후보정 완성도' }
];

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
}`;

/**
 * Get AI critique for a photo
 * @param {string} imageBase64 - Base64 encoded image (without data:image prefix)
 * @param {Object} options
 * @param {'anthropic'|'openai'} options.provider - AI provider
 * @param {string} options.apiKey - API key
 * @returns {Promise<Object>} Critique result
 */
export async function getAICritique(imageBase64, options = {}) {
  const { provider = 'anthropic', apiKey } = options;

  if (!apiKey) {
    throw new Error('API key is required. Set it in settings or environment.');
  }

  // Strip data URL prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  if (provider === 'anthropic') {
    return callAnthropic(base64Data, apiKey);
  } else if (provider === 'openai') {
    return callOpenAI(base64Data, apiKey);
  }

  throw new Error(`Unknown provider: ${provider}`);
}

async function callAnthropic(base64Data, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64Data
            }
          },
          {
            type: 'text',
            text: SYSTEM_PROMPT
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content[0].text;
  return parseAIResponse(text);
}

async function callOpenAI(base64Data, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: SYSTEM_PROMPT
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${base64Data}`
            }
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices[0].message.content;
  return parseAIResponse(text);
}

function parseAIResponse(text) {
  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse AI response as JSON');
  }

  const result = JSON.parse(jsonMatch[0]);

  // Calculate total score
  const scores = result.scores;
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;

  return {
    ...result,
    totalScore: Math.round(totalScore * 10) / 10
  };
}

/**
 * Firebase Cloud Function version (deploy separately)
 *
 * // functions/index.js
 * const functions = require('firebase-functions');
 * const admin = require('firebase-admin');
 * const Anthropic = require('@anthropic-ai/sdk');
 *
 * admin.initializeApp();
 *
 * exports.autoEvaluatePhoto = functions.storage.object().onFinalize(async (object) => {
 *   if (!object.name.includes('/original.jpg')) return;
 *
 *   const photoId = object.name.split('/')[1];
 *   const bucket = admin.storage().bucket();
 *   const file = bucket.file(object.name);
 *   const [buffer] = await file.download();
 *   const base64 = buffer.toString('base64');
 *
 *   const client = new Anthropic({ apiKey: functions.config().anthropic.key });
 *   const message = await client.messages.create({
 *     model: 'claude-sonnet-4-20250514',
 *     max_tokens: 1024,
 *     messages: [{ role: 'user', content: [
 *       { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
 *       { type: 'text', text: SYSTEM_PROMPT }
 *     ]}]
 *   });
 *
 *   const result = parseAIResponse(message.content[0].text);
 *   await admin.firestore().doc(`photos/${photoId}`).update({
 *     scores: result.scores,
 *     totalScore: result.totalScore,
 *     critique: result.critique,
 *     aiEvaluated: true
 *   });
 * });
 */
