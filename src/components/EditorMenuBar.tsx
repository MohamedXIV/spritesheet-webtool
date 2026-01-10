'use client';

/**
 * EditorMenuBar - Professional menu bar with File and View menus
 */

import React from 'react';
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
  MenubarShortcut,
} from '@/components/ui/menubar';

// Panel definitions for the View menu
const PANELS = [
  { id: 'video-loader', name: 'Load Video' },
  { id: 'frame-grid', name: 'Frames' },
  { id: 'preview', name: 'Preview' },
  { id: 'timeline', name: 'Timeline' },
  { id: 'bg-removal', name: 'Background Removal' },
  { id: 'outline', name: 'Outline' },
  { id: 'watermark', name: 'Watermark' },
  { id: 'export', name: 'Export' },
] as const;

interface EditorMenuBarProps {
  visiblePanels: Set<string>;
  onTogglePanel: (panelId: string) => void;
  onResetLayout: () => void;
  onOpenVideo: () => void;
  onExport: () => void;
}

export function EditorMenuBar({
  visiblePanels,
  onTogglePanel,
  onResetLayout,
  onOpenVideo,
  onExport,
}: EditorMenuBarProps) {
  return (
    <Menubar className="rounded-none border-none border-b border-border bg-background px-2">
      {/* File Menu */}
      <MenubarMenu>
        <MenubarTrigger className="font-medium">File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onOpenVideo}>
            Open Video...
            <MenubarShortcut>Ctrl+O</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={onExport}>
            Export...
            <MenubarShortcut>Ctrl+E</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* View Menu */}
      <MenubarMenu>
        <MenubarTrigger className="font-medium">View</MenubarTrigger>
        <MenubarContent>
          {PANELS.map((panel) => (
            <MenubarCheckboxItem
              key={panel.id}
              checked={visiblePanels.has(panel.id)}
              onCheckedChange={() => onTogglePanel(panel.id)}
            >
              {panel.name}
            </MenubarCheckboxItem>
          ))}
          <MenubarSeparator />
          <MenubarItem onClick={onResetLayout}>
            Reset Layout
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
