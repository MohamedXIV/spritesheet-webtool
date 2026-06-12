import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      provider,
      prompt,
      apiKey,
      model,
      size,
      customEndpoint,
      customHeaders,
      customPayload,
      cliCommand,
      cliOutputMethod,
      cliOutputPath,
      openaiKey,
      googleKey,
      uvSnapshot,
    } = body;

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
        googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;
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
        googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:predict?key=${apiKey}`;
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

    if (provider === 'custom') {
      if (!customEndpoint) {
        return NextResponse.json(
          { success: false, error: 'Custom Endpoint URL is required' },
          { status: 400 }
        );
      }

      // Parse width/height from size (e.g. '512x512' -> 512, 512)
      let width = 512;
      let height = 512;
      if (size && size.includes('x')) {
        const parts = size.split('x');
        width = parseInt(parts[0], 10) || 512;
        height = parseInt(parts[1], 10) || 512;
      }

      // Build payload
      let reqBody: any;
      if (customPayload) {
        // user provided custom payload. We can substitute variables if they are in JSON strings.
        const serialized = JSON.stringify(customPayload);
        const replaced = serialized
          .replace(/\${prompt}/g, prompt)
          .replace(/\${width}/g, String(width))
          .replace(/\${height}/g, String(height))
          .replace(/\${size}/g, size || '512x512');
        try {
          reqBody = JSON.parse(replaced);
        } catch {
          reqBody = customPayload;
        }
      } else {
        // default Stable Diffusion WebUI or custom endpoint layout
        reqBody = {
          prompt,
          width,
          height,
          steps: 20,
        };
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(customHeaders || {}),
      };

      const customResponse = await fetch(customEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody),
      });

      if (!customResponse.ok) {
        const errText = await customResponse.text();
        return NextResponse.json(
          { success: false, error: `Custom API Error (${customResponse.status}): ${errText}` },
          { status: customResponse.status }
        );
      }

      const data = await customResponse.json();

      // Dynamically scan for base64 or URL data
      let imageContent = '';
      let imageUrl = '';

      // 1. Stable diffusion WebUI returns `images: [ "base64..." ]`
      if (data.images && Array.isArray(data.images) && data.images.length > 0) {
        imageContent = data.images[0];
      }
      // 2. OpenAI-like returns `data: [ { b64_json: "..." } ]` or `data: [ { url: "..." } ]`
      else if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        if (data.data[0].b64_json) {
          imageContent = data.data[0].b64_json;
        } else if (data.data[0].url) {
          imageUrl = data.data[0].url;
        }
      }
      // 3. Google-like returns `predictions: [ { bytesBase64Encoded: "..." } ]`
      else if (data.predictions && Array.isArray(data.predictions) && data.predictions.length > 0) {
        imageContent = data.predictions[0].bytesBase64Encoded || data.predictions[0];
      }
      // 4. Check for direct outputs (ComfyUI / Replicate style)
      else if (data.output) {
        if (Array.isArray(data.output) && data.output.length > 0) {
          const item = data.output[0];
          if (typeof item === 'string') {
            if (item.startsWith('http')) imageUrl = item;
            else imageContent = item;
          }
        } else if (typeof data.output === 'string') {
          if (data.output.startsWith('http')) imageUrl = data.output;
          else imageContent = data.output;
        } else if (data.output.image) {
          if (data.output.image.startsWith('http')) imageUrl = data.output.image;
          else imageContent = data.output.image;
        }
      }
      // 5. Look for standard "image" or "result" keys
      else if (data.image && typeof data.image === 'string') {
        if (data.image.startsWith('http')) imageUrl = data.image;
        else imageContent = data.image;
      } else if (data.result && typeof data.result === 'string') {
        if (data.result.startsWith('http')) imageUrl = data.result;
        else imageContent = data.result;
      }

      // If we found a URL, fetch it and convert to base64 to avoid client CORS
      if (imageUrl) {
        try {
          const imgFetch = await fetch(imageUrl);
          if (imgFetch.ok) {
            const arrayBuffer = await imgFetch.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            imageContent = buffer.toString('base64');
          } else {
            return NextResponse.json(
              { success: false, error: `Failed to fetch image URL from custom API: ${imageUrl}` },
              { status: 500 }
            );
          }
        } catch (fetchErr: any) {
          return NextResponse.json(
            { success: false, error: `Error fetching image URL: ${fetchErr.message}` },
            { status: 500 }
          );
        }
      }

      // Clean up base64 prefix if present (e.g. "data:image/png;base64,...")
      if (imageContent && imageContent.includes('base64,')) {
        imageContent = imageContent.split('base64,')[1];
      }

      if (!imageContent) {
        return NextResponse.json(
          {
            success: false,
            error: 'Could not extract image data (Base64 or URL) from Custom API response. Please check payload response format.',
            debugResponse: data,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, image: imageContent });
    }

    if (provider === 'local-cli') {
      if (!cliCommand) {
        return NextResponse.json(
          { success: false, error: 'CLI Command is required for local-cli provider' },
          { status: 400 }
        );
      }

      // Parse width/height from size (e.g. '512x512' -> 512, 512)
      let width = 512;
      let height = 512;
      if (size && size.includes('x')) {
        const parts = size.split('x');
        width = parseInt(parts[0], 10) || 512;
        height = parseInt(parts[1], 10) || 512;
      }

      const tempDir = os.tmpdir();
      const tempFileName = `spritesheet-ai-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.png`;
      const tempFilePath = path.join(tempDir, tempFileName);

      const tempUvFileName = `spritesheet-uv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.png`;
      const tempUvFilePath = path.join(tempDir, tempUvFileName);

      try {
        if (uvSnapshot) {
          let uvBase64 = uvSnapshot;
          if (uvBase64.includes('base64,')) {
            uvBase64 = uvBase64.split('base64,')[1];
          }
          fs.writeFileSync(tempUvFilePath, Buffer.from(uvBase64, 'base64'));
        }

        const replacements: Record<string, string> = {
          '${prompt}': prompt,
          '${width}': String(width),
          '${height}': String(height),
          '${size}': size || '512x512',
          '${output}': tempFilePath,
          '${uv}': uvSnapshot ? tempUvFilePath : '',
        };

        // Replace placeholders in the CLI command
        let resolvedCommand = cliCommand;
        for (const [placeholder, val] of Object.entries(replacements)) {
          resolvedCommand = resolvedCommand.replaceAll(placeholder, val);
        }

        console.log(`Executing Local CLI command: ${resolvedCommand}`);

        const isWindows = process.platform === 'win32';
        const runsAgent = resolvedCommand.includes('agy') || resolvedCommand.includes('claude');
        const spawnCwd = runsAgent ? tempDir : process.cwd();
        
        // Run using spawn in a shell
        const child = spawn(resolvedCommand, {
          shell: isWindows ? 'cmd.exe' : '/bin/sh',
          windowsVerbatimArguments: true,
          cwd: spawnCwd,
          env: {
            ...process.env,
            GEMINI_API_KEY: googleKey || apiKey || process.env.GEMINI_API_KEY || '',
            GOOGLE_API_KEY: googleKey || apiKey || process.env.GOOGLE_API_KEY || '',
            OPENAI_API_KEY: openaiKey || apiKey || process.env.OPENAI_API_KEY || '',
            ANTHROPIC_API_KEY: openaiKey || apiKey || process.env.ANTHROPIC_API_KEY || '',
          }
        });

        // Close stdin so interactive CLIs don't hang waiting for input
        child.stdin?.end();

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        const exitCode = await new Promise<number | null | string>((resolve) => {
          const timeout = setTimeout(() => {
            child.kill();
            resolve('TIMEOUT');
          }, 60000); // 60 second timeout

          child.on('close', (code) => {
            clearTimeout(timeout);
            resolve(code);
          });
        });

        if (exitCode === 'TIMEOUT') {
          return NextResponse.json(
            { 
              success: false, 
              error: 'CLI command timed out after 60 seconds',
              debugResponse: { stdout, stderr, exitCode: 'TIMEOUT' }
            },
            { status: 500 }
          );
        }

        if (exitCode !== 0) {
          return NextResponse.json(
            { 
              success: false, 
              error: `CLI Command failed with exit code ${exitCode}. Stderr: ${stderr}`,
              debugResponse: { stdout, stderr, exitCode }
            },
            { status: 500 }
          );
        }

        let imageBase64 = '';

        if (cliOutputMethod === 'stdout') {
          let cleanStdout = stdout.trim();
          if (cleanStdout.includes('base64,')) {
            cleanStdout = cleanStdout.split('base64,')[1];
          }
          // Remove non-base64 characters
          cleanStdout = cleanStdout.replace(/[^A-Za-z0-9+/=]/g, '');
          imageBase64 = cleanStdout;
        } else {
          const finalFilePath = cliOutputPath ? cliOutputPath.replace(/\${output}/g, tempFilePath) : tempFilePath;
          
          if (!fs.existsSync(finalFilePath)) {
            return NextResponse.json(
              { 
                success: false, 
                error: `CLI command executed successfully but output file was not found at path: ${finalFilePath}. Stderr: ${stderr}`,
                debugResponse: { stdout, stderr, exitCode }
              },
              { status: 500 }
            );
          }

          try {
            const fileBuffer = fs.readFileSync(finalFilePath);
            imageBase64 = fileBuffer.toString('base64');
          } catch (readErr: any) {
            return NextResponse.json(
              { 
                success: false, 
                error: `Failed to read output file: ${readErr.message}`,
                debugResponse: { stdout, stderr, exitCode }
              },
              { status: 500 }
            );
          }
        }

        if (!imageBase64) {
          return NextResponse.json(
            { 
              success: false, 
              error: 'CLI command returned empty output or invalid base64',
              debugResponse: { stdout, stderr, exitCode }
            },
            { status: 500 }
          );
        }

        return NextResponse.json({ success: true, image: imageBase64 });
      } finally {
        if (fs.existsSync(tempFilePath)) {
          try { fs.unlinkSync(tempFilePath); } catch {}
        }
        if (fs.existsSync(tempUvFilePath)) {
          try { fs.unlinkSync(tempUvFilePath); } catch {}
        }
      }
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
