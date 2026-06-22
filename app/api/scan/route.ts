import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType } = await req.json()

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

    const prompt = `You are a business card scanner. Extract the following fields from this business card image and return ONLY a valid JSON object with no extra text, no markdown, no explanation.

Fields to extract:
- name (full name of the person)
- email (email address, empty string if not found)
- phone (phone number(s), comma separated if multiple, empty string if not found)
- company (company or organization name, empty string if not found)
- designation (job title or role, empty string if not found)
- website (website URL, empty string if not found)

Return format (JSON only, nothing else):
{"name":"","email":"","phone":"","company":"","designation":"","website":""}`

    // Retry up to 3 times on 503
    let lastError: any
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await model.generateContent([
          prompt,
          { inlineData: { data: imageBase64, mimeType: mimeType || 'image/jpeg' } },
        ])

        const text = result.response.text().trim()
        let cleaned = text.replace(/```json|```/g, '').trim()
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('Could not extract JSON from Gemini response')
        const parsed = JSON.parse(jsonMatch[0])
        return NextResponse.json({ success: true, data: parsed })

      } catch (err: any) {
        lastError = err
        const is503 = err.message?.includes('503') || err.message?.includes('Service Unavailable')
        if (is503 && attempt < 3) {
          await sleep(attempt * 1500) // 1.5s, then 3s
          continue
        }
        throw err
      }
    }

    throw lastError

  } catch (err: any) {
    console.error('Gemini scan error:', err)
    return NextResponse.json({ error: err.message || 'Scan failed' }, { status: 500 })
  }
}