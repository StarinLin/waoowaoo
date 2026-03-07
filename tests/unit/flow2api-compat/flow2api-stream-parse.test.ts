import { describe, expect, it } from 'vitest'
import { Flow2APISseParser } from '@/lib/flow2api/sse'
import {
  extractImageUrlFromFlow2APIContent,
  extractVideoUrlFromFlow2APIContent,
  tryExtractBase64FromImageUrl,
} from '@/lib/flow2api/parse'

describe('flow2api stream parser + content extraction', () => {
  it('extracts final delta.content from Flow2API SSE stream', () => {
    const parser = new Flow2APISseParser()

    const sse = [
      'data: {"choices":[{"delta":{"reasoning_content":"processing...\\n"},"finish_reason":null}]}\r\n\r\n',
      'data: {"choices":[{"delta":{"content":"![Generated Image](http://localhost:8000/tmp/a.jpg)"},"finish_reason":"stop"}]}\r\n\r\n',
      'data: [DONE]\r\n\r\n',
    ].join('')

    const result = parser.push(sse)
    expect(result.done).toBe(true)
    expect(result.content).toBe('![Generated Image](http://localhost:8000/tmp/a.jpg)')
    expect(parser.getFinalContent()).toBe('![Generated Image](http://localhost:8000/tmp/a.jpg)')
  })

  it('uses reasoning_content as final content when finish_reason=stop but content missing', () => {
    const parser = new Flow2APISseParser()
    const sse = [
      'data: {"choices":[{"delta":{"reasoning_content":"![Generated Image](http://localhost:8000/tmp/a.jpg)"},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ].join('')
    const result = parser.push(sse)
    expect(result.done).toBe(true)
    expect(result.content).toBe('![Generated Image](http://localhost:8000/tmp/a.jpg)')
  })

  it('extracts image url and base64 payload from markdown', () => {
    const url = 'data:image/jpeg;base64,AAAA'
    const content = `![Generated Image](${url})`
    expect(extractImageUrlFromFlow2APIContent(content)).toBe(url)
    const base64 = tryExtractBase64FromImageUrl(url)
    expect(base64).toEqual({ mimeType: 'image/jpeg', base64: 'AAAA' })
  })

  it('extracts video url from html snippet', () => {
    const content = "<video src='http://localhost:8000/tmp/v.mp4' controls></video>"
    expect(extractVideoUrlFromFlow2APIContent(content)).toBe('http://localhost:8000/tmp/v.mp4')
  })

  it('returns flow2api success url when SSE payload is success json', () => {
    const parser = new Flow2APISseParser()
    const sse = 'data: {"status":"success","url":"http://localhost:8000/tmp/v.mp4"}\n\n'

    const result = parser.push(sse)

    expect(result).toEqual({
      done: true,
      content: 'http://localhost:8000/tmp/v.mp4',
    })
    expect(parser.getFinalContent()).toBe('http://localhost:8000/tmp/v.mp4')
  })

  it('flushes trailing flow2api success payload without separator', () => {
    const parser = new Flow2APISseParser()
    const sse = 'data: {"status":"success","url":"http://localhost:8000/tmp/v.mp4"}'

    const pushResult = parser.push(sse)
    const flushResult = parser.flush()

    expect(pushResult).toEqual({ done: false })
    expect(flushResult).toEqual({
      done: true,
      content: 'http://localhost:8000/tmp/v.mp4',
    })
  })

  it('returns flow2api error message when SSE payload is error json', () => {
    const parser = new Flow2APISseParser()
    const sse = 'data: {"error":{"message":"provider overloaded"}}\n\n'

    const result = parser.push(sse)

    expect(result).toEqual({
      done: true,
      errorMessage: 'provider overloaded',
    })
    expect(parser.getFinalErrorMessage()).toBe('provider overloaded')
  })
})
