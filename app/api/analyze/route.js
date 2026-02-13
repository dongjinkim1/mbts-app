const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const PRIMARY_MODEL = 'claude-sonnet-4-5-20250929'
const FALLBACK_MODEL = 'claude-sonnet-4-20250514'

async function callAnthropic(model, systemPrompt, userPrompt) {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  return response
}

export async function POST(request) {
  console.log('[analyze] 요청 시작')

  try {
    const { systemPrompt, userPrompt } = await request.json()

    if (!systemPrompt || !userPrompt) {
      return Response.json(
        { error: 'systemPrompt와 userPrompt가 필요합니다.' },
        { status: 400 }
      )
    }

    // 1차 시도: Primary 모델
    console.log(`[analyze] 1차 시도: ${PRIMARY_MODEL}`)
    let response = await callAnthropic(PRIMARY_MODEL, systemPrompt, userPrompt)

    // 400 또는 404일 때만 폴백
    if (response.status === 400 || response.status === 404) {
      console.log(`[analyze] 1차 실패 (${response.status}), 폴백: ${FALLBACK_MODEL}`)
      response = await callAnthropic(FALLBACK_MODEL, systemPrompt, userPrompt)
    }

    // 폴백 후에도 실패하면 에러 반환
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[analyze] API 에러 (${response.status}):`, errorText)
      return Response.json(
        { error: `Anthropic API 에러: ${response.status}` },
        { status: response.status }
      )
    }

    console.log('[analyze] 스트리밍 응답 전달 시작')

    // SSE 스트림을 그대로 클라이언트에 전달
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[analyze] 서버 에러:', error)
    return Response.json(
      { error: '서버 내부 에러가 발생했습니다.' },
      { status: 500 }
    )
  }
}
