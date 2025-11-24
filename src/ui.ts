// src/ui.ts

interface ParsedSchema {
  components: Array<{ id: string; name: string; childCount: number }>;
  componentSets: Array<{ id: string; name: string; variantCount: number }>;
  tokens: string[];
  textStyles: string[];
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
}

let currentSchema: ParsedSchema | null = null;

// File picker handling
const filePicker = document.getElementById('filePicker')!;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const fileStatus = document.getElementById('fileStatus')!;
const componentsSection = document.getElementById('componentsSection')!;
const componentList = document.getElementById('componentList')!;
const tokenSection = document.getElementById('tokenSection')!;
const tokenStatus = document.getElementById('tokenStatus')!;
const tokenWarnings = document.getElementById('tokenWarnings')!;
const generateBtn = document.getElementById('generateBtn') as HTMLButtonElement;

filePicker.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    handleJsonContent(text, file.name);
  } catch (err) {
    showFileError('Failed to read file');
  }
});

function handleJsonContent(jsonString: string, fileName: string) {
  // For now, just parse and show basic info
  // Full validation will be done by main thread
  try {
    const raw = JSON.parse(jsonString);

    // Basic extraction
    const components = (raw.components || []).map((c: { id: string; name: string; children?: unknown[] }) => ({
      id: c.id || 'unknown',
      name: c.name || 'Unnamed',
      childCount: (c.children || []).length,
    }));

    const componentSets = (raw.componentSets || []).map((s: { id: string; name: string; variants?: unknown[] }) => ({
      id: s.id || 'unknown',
      name: s.name || 'Unnamed',
      variantCount: (s.variants || []).length,
    }));

    currentSchema = {
      components,
      componentSets,
      tokens: [], // Will be filled by main thread
      textStyles: [],
      errors: [],
      warnings: [],
    };

    // Update UI
    filePicker.classList.add('has-file');
    fileStatus.innerHTML = `
      <div class="file-name">📄 ${fileName}</div>
      <div class="status success">✓ Parsed successfully</div>
    `;

    // Show components
    componentsSection.classList.remove('hidden');
    componentList.innerHTML = '';

    componentSets.forEach((set: { id: string; name: string; variantCount: number }) => {
      componentList.innerHTML += `
        <div class="component-item">
          <input type="checkbox" checked data-id="${set.id}">
          <span>${set.name}</span>
          <span class="component-meta">${set.variantCount} variants</span>
        </div>
      `;
    });

    components.forEach((comp: { id: string; name: string; childCount: number }) => {
      componentList.innerHTML += `
        <div class="component-item">
          <input type="checkbox" checked data-id="${comp.id}">
          <span>${comp.name}</span>
          <span class="component-meta">${comp.childCount} children</span>
        </div>
      `;
    });

    // Token section placeholder
    tokenSection.classList.remove('hidden');
    tokenStatus.innerHTML = '<span class="status">Token resolution will happen on generate</span>';

    generateBtn.disabled = false;

    // Store JSON for sending to main
    (window as { jsonContent?: string }).jsonContent = jsonString;

  } catch (err) {
    showFileError(`JSON parse error: ${(err as Error).message}`);
  }
}

function showFileError(message: string) {
  filePicker.classList.remove('has-file');
  fileStatus.innerHTML = `<div class="status error">✗ ${message}</div>`;
  componentsSection.classList.add('hidden');
  tokenSection.classList.add('hidden');
  generateBtn.disabled = true;
  currentSchema = null;
}

generateBtn.addEventListener('click', () => {
  const jsonContent = (window as { jsonContent?: string }).jsonContent;
  if (!jsonContent) return;

  // Get selected component IDs
  const checkboxes = componentList.querySelectorAll('input[type="checkbox"]:checked');
  const selectedIds = Array.from(checkboxes).map(cb => (cb as HTMLInputElement).dataset.id);

  parent.postMessage({
    pluginMessage: {
      type: 'generate',
      payload: {
        json: jsonContent,
        selectedIds,
      }
    }
  }, '*');

  generateBtn.textContent = 'Generating...';
  generateBtn.disabled = true;
});

// Handle messages from main
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === 'generation-complete') {
    generateBtn.textContent = 'Generate Components';
    generateBtn.disabled = false;
  }

  if (msg.type === 'token-warnings') {
    const warnings = msg.payload as string[];
    if (warnings.length > 0) {
      tokenWarnings.classList.remove('hidden');
      tokenWarnings.innerHTML = warnings.map(w => `<div class="warning-item">⚠ ${w}</div>`).join('');
    }
  }
};
