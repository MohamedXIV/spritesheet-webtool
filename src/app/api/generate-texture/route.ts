import { NextRequest, NextResponse } from 'next/server';
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      provider,
      prompt,
      apiKey,
      model,
      size,
    } = body;

    // Only fixed, first-party provider endpoints are allowed on the public
    // server. Arbitrary URL proxies and shell commands must never run here.
    if (provider === 'custom' || provider === 'local-cli') {
      return NextResponse.json(
        { success: false, error: 'Custom endpoints and local CLI execution are disabled on the hosted server.' },
        { status: 403 }
      );
    }

    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000 ||
        typeof apiKey !== 'string' || apiKey.length > 4096 ||
        (provider !== 'openai' && provider !== 'google')) {
      return NextResponse.json({ success: false, error: 'Invalid provider, prompt, or API key.' }, { status: 400 });
    }
    if (model && (typeof model !== 'string' || !/^[a-zA-Z0-9._-]{1,120}$/.test(model))) {
      return NextResponse.json({ success: false, error: 'Invalid model name.' }, { status: 400 });
    }
    if (size && (typeof size !== 'string' || !/^[1-9][0-9]{1,3}x[1-9][0-9]{1,3}$/.test(size))) {
      return NextResponse.json({ success: false, error: 'Invalid image size.' }, { status: 400 });
    }

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'Prompt is required' },
        { status: 400 }
      );
    }

    if (provider === 'openai') {
      if (!apiKey) {
        return NextResponse.json(
          { success: false, error: 'OpenAI API key is required' },
          { status: 400 }
        );
      }

      const openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'dall-e-3',
          prompt: prompt,
          n: 1,
          size: size || '1024x1024',
          response_format: 'b64_json',
        }),
      });

      if (!openaiResponse.ok) {
        const errText = await openaiResponse.text();
        let errMsg = errText;
        try {
          const parsed = JSON.parse(errText);
          errMsg = parsed.error?.message || errText;
        } catch {}
        return NextResponse.json(
          { success: false, error: `OpenAI API Error: ${errMsg}` },
          { status: openaiResponse.status }
        );
      }

      const data = await openaiResponse.json();
      const b64Image = data.data?.[0]?.b64_json;
      if (!b64Image) {
        return NextResponse.json(
          { success: false, error: 'No image data returned from OpenAI' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, image: b64Image });
    }

    if (provider === 'google') {
      if (!apiKey) {
        return NextResponse.json(
          { success: false, error: 'Google API key is required' },
          { status: 400 }
        );
      }

      const selectedModel = model || 'gemini-2.5-flash-image';
      const isGeminiImageModel = selectedModel.includes('gemini-2.5-flash-image');

      let googleUrl = '';
      let reqBody = {};

      if (isGeminiImageModel) {
        // Codenamed "Nano Banana" - First-class image generation via Google AI Studio
        googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
        reqBody = {
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            responseModalities: ['IMAGE']
          }
        };
      } else {
        // Legacy Imagen prediction endpoints (deprecating June 24, 2026)
        googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:predict?key=${encodeURIComponent(apiKey)}`;
        reqBody = {
          instances: [
            {
              prompt: prompt,
            },
          ],
          parameters: {
            sampleCount: 1,
            aspectRatio: '1:1',
          },
        };
      }

      const googleResponse = await fetch(googleUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(reqBody),
      });

      if (!googleResponse.ok) {
        const errText = await googleResponse.text();
        let errMsg = errText;
        try {
          const parsed = JSON.parse(errText);
          errMsg = parsed.error?.message || parsed.error || errText;
        } catch {}
        return NextResponse.json(
          { success: false, error: `Google AI Studio API Error: ${errMsg}` },
          { status: googleResponse.status }
        );
      }

      const data = await googleResponse.json();
      let bytesBase64 = '';

      if (isGeminiImageModel) {
        const part = data.candidates?.[0]?.content?.parts?.[0];
        bytesBase64 = part?.inlineData?.data || part?.inline_data?.data || '';
      } else {
        bytesBase64 = data.predictions?.[0]?.bytesBase64Encoded || '';
      }

      if (!bytesBase64) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'No image data returned from Google API. Please check your prompt or API billing limits.',
            debugResponse: data
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, image: bytesBase64 });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid provider specified' },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('AI Texture Proxy Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
