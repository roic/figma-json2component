// src/main.ts

// Show plugin UI
figma.showUI(__html__, { width: 400, height: 500 });

// Handle messages from UI
figma.ui.onmessage = async (msg: { type: string; payload?: unknown }) => {
  if (msg.type === 'generate') {
    // TODO: Implement generation
    figma.notify('Generation not yet implemented');
  }

  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};
