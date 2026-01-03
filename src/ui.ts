// src/ui.ts

interface ParsedSchema {
  components: Array<{ id: string; name: string; childCount: number }>;
  componentSets: Array<{ id: string; name: string; variantCount: number }>;
  tokens: string[];
  textStyles: string[];
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
}

interface TokenValidationResult {
  found: Array<{ token: string; type: string }>;
  missing: Array<{ token: string; type: string; suggestion?: string }>;
  total: number;
  error?: string;
  iconIssues?: Array<{ iconRef: string; error: string }>;
  registriesLoaded?: string[];
}

let currentSchema: ParsedSchema | null = null;

// Module state
const state = {
  jsonContents: [] as string[],
  pendingGeneration: false,
};

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

// Dialog elements
const tokenDialog = document.getElementById('tokenDialog')!;
const dialogFoundCount = document.getElementById('dialogFoundCount')!;
const dialogMissingCount = document.getElementById('dialogMissingCount')!;
const dialogMissingList = document.getElementById('dialogMissingList')!;
const dialogCancel = document.getElementById('dialogCancel')!;
const dialogProceed = document.getElementById('dialogProceed')!;

// Extraction elements
const libraryNameInput = document.getElementById('libraryNameInput') as HTMLInputElement;
const extractBtn = document.getElementById('extractBtn') as HTMLButtonElement;
const extractionResult = document.getElementById('extractionResult')!;
const extractionCount = document.getElementById('extractionCount')!;
const registryOutput = document.getElementById('registryOutput') as HTMLTextAreaElement;
const copyRegistryBtn = document.getElementById('copyRegistryBtn')!;

filePicker.addEventListener('click', () => fileInput.click());

filePicker.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  filePicker.classList.add('drag-over');
});

filePicker.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  filePicker.classList.remove('drag-over');
});

filePicker.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  filePicker.classList.remove('drag-over');

  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;

  // Filter for JSON files
  const jsonFiles = Array.from(files).filter(f => f.name.endsWith('.json'));
  if (jsonFiles.length === 0) {
    showFileError('Please drop JSON files');
    return;
  }

  try {
    const fileContents: string[] = [];
    const fileNames: string[] = [];

    for (const file of jsonFiles) {
      const text = await file.text();
      fileContents.push(text);
      fileNames.push(file.name);
    }

    handleJsonContents(fileContents, fileNames);
  } catch (err) {
    showFileError('Failed to read dropped files');
  }
});

fileInput.addEventListener('change', async (e) => {
  const files = (e.target as HTMLInputElement).files;
  if (!files || files.length === 0) return;

  try {
    // Read all selected files
    const fileContents: string[] = [];
    const fileNames: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const text = await file.text();
      fileContents.push(text);
      fileNames.push(file.name);
    }

    handleJsonContents(fileContents, fileNames);
  } catch (err) {
    showFileError('Failed to read file(s)');
  }
});

function handleJsonContents(jsonStrings: string[], fileNames: string[]) {
  // Parse and merge all files
  // Full validation will be done by main thread
  try {
    const allComponents: Array<{ id: string; name: string; childCount: number }> = [];
    const allComponentSets: Array<{ id: string; name: string; variantCount: number }> = [];

    jsonStrings.forEach((jsonString) => {
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

      allComponents.push(...components);
      allComponentSets.push(...componentSets);
    });

    currentSchema = {
      components: allComponents,
      componentSets: allComponentSets,
      tokens: [], // Will be filled by main thread
      textStyles: [],
      errors: [],
      warnings: [],
    };

    // Update UI
    filePicker.classList.add('has-file');
    const fileNameDisplay = fileNames.length === 1
      ? `📄 ${fileNames[0]}`
      : `📁 ${fileNames.length} files selected`;

    fileStatus.innerHTML = `
      <div class="file-name">${fileNameDisplay}</div>
      <div class="status success">✓ Parsed successfully</div>
    `;

    // Show components
    componentsSection.classList.remove('hidden');
    componentList.innerHTML = '';

    allComponentSets.forEach((set: { id: string; name: string; variantCount: number }) => {
      componentList.innerHTML += `
        <div class="component-item">
          <input type="checkbox" checked data-id="${set.id}">
          <span>${set.name}</span>
          <span class="component-meta">${set.variantCount} variants</span>
        </div>
      `;
    });

    allComponents.forEach((comp: { id: string; name: string; childCount: number }) => {
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

    // Store all JSON contents for sending to main
    state.jsonContents = jsonStrings;

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
  const jsonContents = state.jsonContents;
  if (!jsonContents || jsonContents.length === 0) return;

  // First, validate tokens
  generateBtn.textContent = 'Checking tokens...';
  generateBtn.disabled = true;
  state.pendingGeneration = true;

  parent.postMessage({
    pluginMessage: {
      type: 'validate-tokens',
      payload: {
        jsonFiles: jsonContents,
      }
    }
  }, '*');
});

function proceedWithGeneration() {
  const jsonContents = state.jsonContents;
  if (!jsonContents || jsonContents.length === 0) return;

  // Get selected component IDs
  const checkboxes = componentList.querySelectorAll('input[type="checkbox"]:checked');
  const selectedIds = Array.from(checkboxes).map(cb => (cb as HTMLInputElement).dataset.id);

  parent.postMessage({
    pluginMessage: {
      type: 'generate',
      payload: {
        jsonFiles: jsonContents,
        selectedIds,
      }
    }
  }, '*');

  generateBtn.textContent = 'Generating...';
  generateBtn.disabled = true;
}

function showTokenDialog(result: TokenValidationResult) {
  dialogFoundCount.textContent = String(result.found.length);

  const totalMissing = result.missing.length + (result.iconIssues?.length || 0);
  dialogMissingCount.textContent = String(totalMissing);

  let html = '';

  // Token issues
  if (result.missing.length > 0) {
    html += '<div style="font-size: 10px; color: #666; margin-bottom: 4px;">Missing tokens:</div>';
    html += result.missing.map(m => `
      <div class="missing-item">
        <div class="missing-token">${m.token}</div>
        ${m.suggestion ? `<div class="missing-suggestion">Did you mean: ${m.suggestion}?</div>` : ''}
      </div>
    `).join('');
  }

  // Icon issues
  if (result.iconIssues && result.iconIssues.length > 0) {
    html += '<div style="font-size: 10px; color: #666; margin: 8px 0 4px;">Icon issues:</div>';
    html += result.iconIssues.map(i => `
      <div class="missing-item">
        <div class="missing-token">${i.iconRef}</div>
        <div class="missing-suggestion">${i.error}</div>
      </div>
    `).join('');
  }

  dialogMissingList.innerHTML = html;

  tokenDialog.style.display = 'flex';
  tokenDialog.classList.remove('hidden');
}

function hideTokenDialog() {
  tokenDialog.style.display = 'none';
  tokenDialog.classList.add('hidden');
}

dialogCancel.addEventListener('click', () => {
  hideTokenDialog();
  state.pendingGeneration = false;
  generateBtn.textContent = 'Generate Components';
  generateBtn.disabled = false;
});

dialogProceed.addEventListener('click', () => {
  hideTokenDialog();
  proceedWithGeneration();
});

// Extraction handlers
extractBtn.addEventListener('click', () => {
  const libraryName = libraryNameInput.value.trim();
  if (!libraryName) {
    alert('Please enter a library name');
    return;
  }

  extractBtn.textContent = 'Extracting...';
  extractBtn.disabled = true;

  parent.postMessage({
    pluginMessage: {
      type: 'extract-registry',
      payload: { libraryName }
    }
  }, '*');
});

copyRegistryBtn.addEventListener('click', () => {
  registryOutput.select();
  document.execCommand('copy');

  const original = copyRegistryBtn.textContent;
  copyRegistryBtn.textContent = 'Copied!';
  setTimeout(() => {
    copyRegistryBtn.textContent = original;
  }, 1500);
});

// Handle messages from main
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === 'token-validation-result') {
    const result = msg.payload as TokenValidationResult;

    if (result.error) {
      // Parse error
      generateBtn.textContent = 'Generate Components';
      generateBtn.disabled = false;
      state.pendingGeneration = false;
      tokenStatus.innerHTML = `<span class="status error">✗ ${result.error}</span>`;
      return;
    }

    const hasTokenIssues = result.missing.length > 0;
    const hasIconIssues = result.iconIssues && result.iconIssues.length > 0;
    const totalIssues = result.missing.length + (result.iconIssues?.length || 0);

    // Show registries loaded info
    let statusHtml = '';
    if (result.registriesLoaded && result.registriesLoaded.length > 0) {
      statusHtml += `<span class="status">Registries: ${result.registriesLoaded.join(', ')}</span><br>`;
    }

    if (!hasTokenIssues && !hasIconIssues) {
      // All good - proceed directly
      statusHtml += `<span class="status success">All ${result.total} tokens found</span>`;
      tokenStatus.innerHTML = statusHtml;
      proceedWithGeneration();
    } else {
      // Some issues - show dialog
      statusHtml += `<span class="status warning">${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found</span>`;
      tokenStatus.innerHTML = statusHtml;
      showTokenDialog(result);
    }
  }

  if (msg.type === 'generation-complete') {
    generateBtn.textContent = 'Generate Components';
    generateBtn.disabled = false;
    state.pendingGeneration = false;
  }

  if (msg.type === 'token-warnings') {
    const warnings = msg.payload as string[];
    if (warnings.length > 0) {
      tokenWarnings.classList.remove('hidden');
      tokenWarnings.innerHTML = warnings.map(w => `<div class="warning-item">⚠ ${w}</div>`).join('');
    }
  }

  if (msg.type === 'extraction-result') {
    const registry = msg.payload.registry;
    const iconCount = Object.keys(registry.icons).length;

    extractionCount.textContent = `Found ${iconCount} icon${iconCount !== 1 ? 's' : ''}`;
    registryOutput.value = JSON.stringify(registry, null, 2);
    extractionResult.style.display = 'block';

    extractBtn.textContent = 'Extract';
    extractBtn.disabled = false;
  }
};
