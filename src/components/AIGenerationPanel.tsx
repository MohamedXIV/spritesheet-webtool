'use client';

import React, { useState, useEffect } from 'react';
import { useThreePainterContext } from '@/contexts/ThreePainterContext';
import { Sparkles, Key, Globe, Sliders, Cpu, Layers, Eye, EyeOff, AlertTriangle, CheckCircle2, Settings } from 'lucide-react';
import styles from './AIGenerationPanel.module.css';

const PRESET_PROMPTS = [
  { label: 'Brick Wall', prompt: 'Seamless retro brick wall texture, pixel art style, dark grout, aged bricks, modular' },
  { label: 'Rusty Plate', prompt: 'Seamless rusty iron plates, dark industrial style, rivets and metallic sheen, seamless tileable' },
  { label: 'Medieval Wood', prompt: 'Seamless medieval wooden planks texture, dark brown oak wood, pixel art pattern, hand-painted' },
  { label: 'Mossy Cobble', prompt: 'Seamless ancient stone cobblestone, green moss in seams, dark fantasy rpg texture' },
  { label: 'Sci-Fi Grid', prompt: 'Seamless sci-fi glowing grid texture, dark metal plating, blue glowing circuit lines, seamless' }
];

export function AIGenerationPanel() {
  const {
    layers,
    activeLayerId,
    importImageToLayer,
    isModelLoaded,
    painter
  } = useThreePainterContext();

  const [provider, setProvider] = useState<'openai' | 'google' | 'custom' | 'local-cli'>('openai');
  const [prompt, setPrompt] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [googleKey, setGoogleKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  // Local CLI Provider settings
  const [cliCommand, setCliCommand] = useState('python scripts/generate.py --prompt "${prompt}" --output "${output}"');
  const [cliOutputMethod, setCliOutputMethod] = useState<'file' | 'stdout'>('file');
  const [cliOutputPath, setCliOutputPath] = useState('');

  // Settings
  const [size, setSize] = useState('512x512');
  const [openaiModel, setOpenaiModel] = useState('dall-e-2'); // default to DALL-E 2 for cheaper & direct 512x512 support
  const [googleModel, setGoogleModel] = useState('gemini-2.5-flash-image');
  const [targetLayer, setTargetLayer] = useState(activeLayerId || '');

  // Custom Provider settings
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [customHeadersRaw, setCustomHeadersRaw] = useState('{\n  "Content-Type": "application/json"\n}');
  const [customPayloadRaw, setCustomPayloadRaw] = useState('{\n  "prompt": "${prompt}",\n  "width": ${width},\n  "height": ${height},\n  "steps": 20\n}');
  const [showCustomConfig, setShowCustomConfig] = useState(false);

  // Operation States
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStep, setGenStep] = useState('');
  const [generatedBase64, setGeneratedBase64] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [debugResponse, setDebugResponse] = useState<any | null>(null);

  // Load saved credentials on mount
  useEffect(() => {
    try {
      const savedOpenai = localStorage.getItem('tp_ai_openai_key');
      const savedGoogle = localStorage.getItem('tp_ai_google_key');
      const savedEndpoint = localStorage.getItem('tp_ai_custom_endpoint');
      const savedHeaders = localStorage.getItem('tp_ai_custom_headers');
      const savedPayload = localStorage.getItem('tp_ai_custom_payload');
      const savedProvider = localStorage.getItem('tp_ai_provider');
      const savedCliCommand = localStorage.getItem('tp_ai_cli_command');
      const savedCliOutputMethod = localStorage.getItem('tp_ai_cli_output_method');
      const savedCliOutputPath = localStorage.getItem('tp_ai_cli_output_path');

      if (savedOpenai) setOpenaiKey(savedOpenai);
      if (savedGoogle) setGoogleKey(savedGoogle);
      if (savedEndpoint) setCustomEndpoint(savedEndpoint);
      if (savedHeaders) setCustomHeadersRaw(savedHeaders);
      if (savedPayload) setCustomPayloadRaw(savedPayload);
      if (savedProvider) setProvider(savedProvider as any);
      if (savedCliCommand) setCliCommand(savedCliCommand);
      if (savedCliOutputMethod) setCliOutputMethod(savedCliOutputMethod as any);
      if (savedCliOutputPath) setCliOutputPath(savedCliOutputPath);
    } catch (e) {
      console.warn('Failed to load saved keys from localStorage', e);
    }
  }, []);

  // Update target layer when context active layer changes
  useEffect(() => {
    if (activeLayerId) {
      setTargetLayer(activeLayerId);
    }
  }, [activeLayerId]);

  // Keep target layer option list validated
  useEffect(() => {
    if (layers.length > 0 && !targetLayer) {
      setTargetLayer(layers[layers.length - 1].id);
    }
  }, [layers, targetLayer]);

  const saveKey = (
    type: 'openai' | 'google' | 'endpoint' | 'headers' | 'payload' | 'provider' | 'cliCommand' | 'cliOutputMethod' | 'cliOutputPath',
    val: string
  ) => {
    try {
      if (type === 'openai') {
        setOpenaiKey(val);
        localStorage.setItem('tp_ai_openai_key', val);
      } else if (type === 'google') {
        setGoogleKey(val);
        localStorage.setItem('tp_ai_google_key', val);
      } else if (type === 'endpoint') {
        setCustomEndpoint(val);
        localStorage.setItem('tp_ai_custom_endpoint', val);
      } else if (type === 'headers') {
        setCustomHeadersRaw(val);
        localStorage.setItem('tp_ai_custom_headers', val);
      } else if (type === 'payload') {
        setCustomPayloadRaw(val);
        localStorage.setItem('tp_ai_custom_payload', val);
      } else if (type === 'provider') {
        setProvider(val as any);
        localStorage.setItem('tp_ai_provider', val);
      } else if (type === 'cliCommand') {
        setCliCommand(val);
        localStorage.setItem('tp_ai_cli_command', val);
      } else if (type === 'cliOutputMethod') {
        setCliOutputMethod(val as any);
        localStorage.setItem('tp_ai_cli_output_method', val);
      } else if (type === 'cliOutputPath') {
        setCliOutputPath(val);
        localStorage.setItem('tp_ai_cli_output_path', val);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePresetClick = (presetPrompt: string) => {
    setPrompt(presetPrompt);
  };

  const base64ToBlob = (base64: string, contentType = 'image/png') => {
    const sliceSize = 512;
    const byteCharacters = atob(base64);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: contentType });
  };

  const getUVSnapshot = (): string | null => {
    if (!painter) return null;
    const meshes = painter.getPaintableMeshes();
    if (!meshes.length) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 1024, 1024);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    meshes.forEach(mesh => {
      const uvAttr = mesh.geometry.attributes.uv;
      const indexAttr = mesh.geometry.index;
      if (!uvAttr) return;

      if (indexAttr) {
        for (let i = 0; i < indexAttr.count; i += 3) {
          const idx0 = indexAttr.getX(i);
          const idx1 = indexAttr.getX(i + 1);
          const idx2 = indexAttr.getX(i + 2);

          const u0 = uvAttr.getX(idx0) * 1024;
          const v0 = (1 - uvAttr.getY(idx0)) * 1024;
          const u1 = uvAttr.getX(idx1) * 1024;
          const v1 = (1 - uvAttr.getY(idx1)) * 1024;
          const u2 = uvAttr.getX(idx2) * 1024;
          const v2 = (1 - uvAttr.getY(idx2)) * 1024;

          ctx.moveTo(u0, v0);
          ctx.lineTo(u1, v1);
          ctx.lineTo(u2, v2);
          ctx.closePath();
        }
      } else {
        for (let i = 0; i < uvAttr.count; i += 3) {
          const u0 = uvAttr.getX(i) * 1024;
          const v0 = (1 - uvAttr.getY(i)) * 1024;
          const u1 = uvAttr.getX(i + 1) * 1024;
          const v1 = (1 - uvAttr.getY(i + 1)) * 1024;
          const u2 = uvAttr.getX(i + 2) * 1024;
          const v2 = (1 - uvAttr.getY(i + 2)) * 1024;

          ctx.moveTo(u0, v0);
          ctx.lineTo(u1, v1);
          ctx.lineTo(u2, v2);
          ctx.closePath();
        }
      }
    });
    ctx.stroke();

    return canvas.toDataURL('image/png');
  };

  const triggerGeneration = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setGeneratedBase64(null);
    setErrorMsg(null);
    setDebugResponse(null);

    try {
      setGenStep('Establishing secure proxy session...');
      await new Promise(r => setTimeout(r, 600));

      setGenStep('Broadcasting prompt variables to AI processor...');
      await new Promise(r => setTimeout(r, 400));

      // Parse custom configurations
      let parsedHeaders = {};
      let parsedPayload = null;

      if (provider === 'custom') {
        try {
          parsedHeaders = JSON.parse(customHeadersRaw);
        } catch (e: any) {
          throw new Error(`Invalid JSON format in custom headers: ${e.message}`);
        }

        try {
          parsedPayload = JSON.parse(customPayloadRaw);
        } catch (e: any) {
          throw new Error(`Invalid JSON format in custom payload template: ${e.message}`);
        }
      }

      setGenStep('Generating tileable seamless canvas map...');

      const response = await fetch('/api/generate-texture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider,
          prompt,
          apiKey: provider === 'openai' ? openaiKey : googleKey,
          model: provider === 'openai' ? openaiModel : googleModel,
          size,
          customEndpoint: provider === 'custom' ? customEndpoint : undefined,
          customHeaders: provider === 'custom' ? parsedHeaders : undefined,
          customPayload: provider === 'custom' ? parsedPayload : undefined,
          cliCommand: provider === 'local-cli' ? cliCommand : undefined,
          cliOutputMethod: provider === 'local-cli' ? cliOutputMethod : undefined,
          cliOutputPath: provider === 'local-cli' ? cliOutputPath : undefined,
          openaiKey,
          googleKey,
          uvSnapshot: getUVSnapshot() || undefined,
        }),
      });

      const resData = await response.json();

      if (!response.ok || !resData.success) {
        if (resData.debugResponse) {
          setDebugResponse(resData.debugResponse);
        }
        throw new Error(resData.error || `Server returned error status ${response.status}`);
      }

      setGenStep('Decoding spatial map elements...');
      await new Promise(r => setTimeout(r, 400));

      setGeneratedBase64(resData.image);
      setGenStep('Success! Map generated.');

      // Proactively inject generated image into selected canvas layer
      if (resData.image && targetLayer && importImageToLayer) {
        setGenStep('Injecting composited map into paint engine...');
        const blob = base64ToBlob(resData.image);
        const file = new File([blob], `ai-texture-${Date.now()}.png`, { type: 'image/png' });
        importImageToLayer(file, targetLayer);
      }

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An unknown network error occurred during image generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyResult = () => {
    if (generatedBase64 && targetLayer && importImageToLayer) {
      const blob = base64ToBlob(generatedBase64);
      const file = new File([blob], `ai-texture-${Date.now()}.png`, { type: 'image/png' });
      importImageToLayer(file, targetLayer);
    }
  };

  if (!isModelLoaded) {
    return (
      <div className={styles.container}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '20px', textAlign: 'center', color: '#52525b' }}>
          <AlertTriangle size={24} style={{ marginBottom: '8px', color: '#52525b' }} />
          <p style={{ margin: 0, fontSize: '10.5px' }}>Import a 3D model in the viewport to enable the AI Control Panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* 1. Provider & Credentials */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Globe size={11} className={styles.icon} />
          <span>AI SERVICE PROVIDER</span>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>PROVIDER</label>
          <select
            className={styles.select}
            value={provider}
            onChange={(e) => saveKey('provider', e.target.value)}
          >
            <option value="openai">OpenAI (DALL-E 2 / 3)</option>
            <option value="google">Google Nanobanana (Gemini/Imagen)</option>
            <option value="custom">Custom JSON REST Endpoint</option>
            <option value="local-cli">Local CLI Command (Shell)</option>
          </select>
        </div>

        {/* Credentials based on provider */}
        {provider === 'openai' && (
          <div className={styles.formGroup}>
            <label className={styles.label}>OPENAI API KEY</label>
            <div className={styles.inputWrapper}>
              <input
                type={showKey ? 'text' : 'password'}
                className={styles.input}
                placeholder="sk-..."
                value={openaiKey}
                onChange={(e) => saveKey('openai', e.target.value)}
              />
              <button
                type="button"
                className={styles.inputToggle}
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
          </div>
        )}

        {provider === 'google' && (
          <div className={styles.formGroup}>
            <label className={styles.label}>GOOGLE AI STUDIO API KEY</label>
            <div className={styles.inputWrapper}>
              <input
                type={showKey ? 'text' : 'password'}
                className={styles.input}
                placeholder="AIzaSy..."
                value={googleKey}
                onChange={(e) => saveKey('google', e.target.value)}
              />
              <button
                type="button"
                className={styles.inputToggle}
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
          </div>
        )}

        {provider === 'custom' && (
          <>
            <div className={styles.formGroup}>
              <label className={styles.label}>ENDPOINT URL</label>
              <input
                type="text"
                className={styles.input}
                placeholder="http://127.0.0.1:7860/sdapi/v1/txt2img"
                value={customEndpoint}
                onChange={(e) => saveKey('endpoint', e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <button
                type="button"
                className={styles.applyBtn}
                style={{ justifyContent: 'space-between', padding: '4px 8px', fontSize: '9px', width: 'fit-content' }}
                onClick={() => setShowCustomConfig(!showCustomConfig)}
              >
                <Settings size={10} />
                <span>{showCustomConfig ? 'Hide Config' : 'Show JSON Payload & Headers'}</span>
              </button>
            </div>

            {showCustomConfig && (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.label}>CUSTOM HEADERS (JSON)</label>
                  <textarea
                    className={`${styles.textarea} ${styles.codeArea}`}
                    value={customHeadersRaw}
                    onChange={(e) => saveKey('headers', e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>PAYLOAD BODY (JSON)</label>
                  <span style={{ fontSize: '8px', color: '#52525b', marginBottom: '2px' }}>
                    Available replacements: {"${prompt}"}, {"${width}"}, {"${height}"}, {"${size}"}
                  </span>
                  <textarea
                    className={`${styles.textarea} ${styles.codeArea}`}
                    value={customPayloadRaw}
                    onChange={(e) => saveKey('payload', e.target.value)}
                  />
                </div>
              </>
            )}
          </>
        )}

        {provider === 'local-cli' && (
          <>
            <div className={styles.formGroup}>
              <label className={styles.label}>AGENT CLI PRESET</label>
              <select
                className={styles.select}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'antigravity') {
                    saveKey('cliCommand', 'agy --dangerously-skip-permissions -p "Please create a ${width}x${height} PNG texture map matching this description: \'${prompt}\'. A UV layout wireframe of the target 3D model is provided at \'${uv}\'. Write a python script using Pillow/numpy to draw textures conforming to these UV islands (drawn as white lines on a black background), and run it to save the output file to: \'${output}\'."');
                  } else if (val === 'claude') {
                    saveKey('cliCommand', 'claude -y -p "Please create a ${width}x${height} PNG texture map matching this description: \'${prompt}\'. A UV layout wireframe of the target 3D model is provided at \'${uv}\'. Write a python script using Pillow/numpy to draw textures conforming to these UV islands (drawn as white lines on a black background), and run it to save the output file to: \'${output}\'."');
                  } else if (val === 'custom') {
                    saveKey('cliCommand', 'python scripts/generate.py --prompt "${prompt}" --output "${output}"');
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>Select a CLI template...</option>
                <option value="custom">Standard Command (Python/Local Script)</option>
                <option value="antigravity">Antigravity CLI Agent (agy)</option>
                <option value="claude">Claude Code Agent (claude)</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>SHELL COMMAND</label>
              <textarea
                className={`${styles.textarea} ${styles.codeArea}`}
                style={{ height: '70px' }}
                placeholder='python scripts/generate.py --prompt "${prompt}" --output "${output}"'
                value={cliCommand}
                onChange={(e) => saveKey('cliCommand', e.target.value)}
              />
              <span style={{ fontSize: '8px', color: '#71717a', marginTop: '2px' }}>
                Variables: {"${prompt}"}, {"${output}"}, {"${width}"}, {"${height}"}, {"${size}"}
              </span>
            </div>

            <div className={styles.grid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>OUTPUT METHOD</label>
                <select
                  className={styles.select}
                  value={cliOutputMethod}
                  onChange={(e) => saveKey('cliOutputMethod', e.target.value)}
                >
                  <option value="file">File Output (${"output"})</option>
                  <option value="stdout">Stdout (Base64)</option>
                </select>
              </div>

              {cliOutputMethod === 'file' && (
                <div className={styles.formGroup}>
                  <label className={styles.label}>CUSTOM OUTPUT PATH (OPTIONAL)</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="e.g. out.png (default: temp)"
                    value={cliOutputPath}
                    onChange={(e) => saveKey('cliOutputPath', e.target.value)}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 2. Generation Prompt & Preset Chips */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Sparkles size={11} className={styles.icon} />
          <span>PROMPT ORCHESTRATION</span>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>PROMPT TEXT</label>
          <textarea
            className={styles.textarea}
            placeholder="Type descriptive prompts to tile seamlessly..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        <div className={styles.presetLabel}>ARTISTIC PRESETS:</div>
        <div className={styles.presetsGrid}>
          {PRESET_PROMPTS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={styles.presetChip}
              onClick={() => handlePresetClick(preset.prompt)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Output Parameters & Mapping */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Sliders size={11} className={styles.icon} />
          <span>MAP MAPPING & CONFIG</span>
        </div>

        <div className={styles.grid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>RESOLUTION</label>
            <select
              className={styles.select}
              value={size}
              onChange={(e) => setSize(e.target.value)}
            >
              <option value="256x256">256 x 256 (Fast / Pixel)</option>
              <option value="512x512">512 x 512 (Balanced)</option>
              <option value="1024x1024">1024 x 1024 (HD Texture)</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>TARGET MODEL</label>
            {provider === 'openai' && (
              <select
                className={styles.select}
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
              >
                <option value="dall-e-2">DALL-E 2 (512x512 native)</option>
                <option value="dall-e-3">DALL-E 3 (Highly detailed)</option>
              </select>
            )}

            {provider === 'google' && (
              <select
                className={styles.select}
                value={googleModel}
                onChange={(e) => setGoogleModel(e.target.value)}
              >
                <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image (Recommended)</option>
                <option value="imagen-3.0-generate-002">Imagen 3 (Generate - Legacy)</option>
                <option value="imagen-3.0-fast-generate-001">Imagen 3 (Fast - Legacy)</option>
              </select>
            )}

            {provider === 'custom' && (
              <select className={styles.select} disabled>
                <option>Custom defined payload</option>
              </select>
            )}

            {provider === 'local-cli' && (
              <select className={styles.select} disabled>
                <option>Managed by local command</option>
              </select>
            )}
          </div>
        </div>

        <div className={styles.formGroup} style={{ marginTop: '8px' }}>
          <label className={styles.label}>INJECT INTO LAYER</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers size={12} style={{ color: '#71717a' }} />
            <select
              className={styles.select}
              value={targetLayer}
              onChange={(e) => setTargetLayer(e.target.value)}
            >
              {layers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} {l.visible ? '' : '(Hidden)'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          className={styles.generateBtn}
          disabled={
            isGenerating ||
            !prompt.trim() ||
            (provider === 'openai' && !openaiKey) ||
            (provider === 'google' && !googleKey) ||
            (provider === 'custom' && !customEndpoint) ||
            (provider === 'local-cli' && !cliCommand.trim())
          }
          onClick={triggerGeneration}
        >
          <Cpu size={14} />
          <span>{isGenerating ? 'Generating Texture...' : 'Generate AI Map'}</span>
        </button>
      </div>

      {/* 4. Generation Status overlays */}
      {isGenerating && (
        <div className={styles.section} style={{ paddingBottom: '20px' }}>
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
            <div className={styles.loadingText}>{genStep}</div>
            <div className={styles.loadingSubtext}>Pixelating textures live upon capture...</div>
          </div>
        </div>
      )}

      {/* 5. Error Reports */}
      {errorMsg && (
        <div className={styles.section}>
          <div className={styles.errorContainer}>
            <div className={styles.errorTitle}>
              <AlertTriangle size={12} />
              <span>Generation Failed</span>
            </div>
            <div className={styles.errorMessage}>{errorMsg}</div>
            {debugResponse && (
              <>
                <div style={{ fontSize: '8px', color: '#f87171', fontWeight: 600, marginTop: '4px' }}>RESPONSE DEBUG:</div>
                <pre className={styles.errorDebug}>
                  {JSON.stringify(debugResponse, null, 2)}
                </pre>
              </>
            )}
          </div>
        </div>
      )}

      {/* 6. Active Preview of Generated Image */}
      {generatedBase64 && !isGenerating && (
        <div className={styles.section}>
          <div className={styles.resultContainer}>
            <div className={styles.resultTitle}>
              <CheckCircle2 size={12} />
              <span>Map Render Completed</span>
            </div>

            <div className={styles.previewGrid}>
              <div className={styles.previewBox}>
                <div className={styles.previewLabel}>RAW IMAGE</div>
                <img
                  className={styles.previewImage}
                  src={`data:image/png;base64,${generatedBase64}`}
                  alt="Raw Generated texture map"
                />
              </div>

              <div className={styles.previewBox}>
                <div className={styles.previewLabel}>LAYER TEXTURE</div>
                <div style={{ position: 'relative', width: '100%' }}>
                  <img
                    className={styles.previewImage}
                    src={`data:image/png;base64,${generatedBase64}`}
                    alt="Active composited viewport preview"
                  />
                  <div style={{ position: 'absolute', bottom: '2px', right: '2px', background: 'rgba(0,0,0,0.7)', color: '#34d399', padding: '1px 3px', borderRadius: '2px', fontSize: '7px', fontWeight: 700 }}>
                    ACTIVE
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              className={styles.applyBtn}
              onClick={handleApplyResult}
            >
              <span>Reload into target layer</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
