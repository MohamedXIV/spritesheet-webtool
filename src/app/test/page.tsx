'use client';

/**
 * Test page for Menubar component styling
 */

import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from '@/components/ui/menubar';
import { useState } from 'react';

export default function TestPage() {
  const [showPanel1, setShowPanel1] = useState(true);
  const [showPanel2, setShowPanel2] = useState(true);
  const [showPanel3, setShowPanel3] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <h1 className="text-2xl font-bold mb-8">Menubar Test Page</h1>
      
      <div className="mb-4 p-4 border border-border rounded-md">
        <p className="text-muted-foreground mb-2">Default Shadcn Menubar:</p>
        
        <Menubar>
          <MenubarMenu>
            <MenubarTrigger>
              <span className="text-primary mr-2">◆</span>
              App Name
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem disabled>Version 1.0.0</MenubarItem>
              <MenubarSeparator />
              <MenubarItem>About</MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger>File</MenubarTrigger>
            <MenubarContent>
              <MenubarItem>
                New File
                <MenubarShortcut>Ctrl+N</MenubarShortcut>
              </MenubarItem>
              <MenubarItem>
                Open...
                <MenubarShortcut>Ctrl+O</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem>
                Save
                <MenubarShortcut>Ctrl+S</MenubarShortcut>
              </MenubarItem>
              <MenubarItem>
                Export...
                <MenubarShortcut>Ctrl+E</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger>View</MenubarTrigger>
            <MenubarContent>
              <MenubarCheckboxItem
                checked={showPanel1}
                onCheckedChange={setShowPanel1}
              >
                Panel 1
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={showPanel2}
                onCheckedChange={setShowPanel2}
              >
                Panel 2 (Longer Name)
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={showPanel3}
                onCheckedChange={setShowPanel3}
              >
                Background Removal
              </MenubarCheckboxItem>
              <MenubarSeparator />
              <MenubarItem>Reset Layout</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </div>

      <div className="mt-8 space-y-2">
        <p>Current state:</p>
        <ul className="list-disc pl-8 text-muted-foreground">
          <li>Panel 1: {showPanel1 ? 'visible' : 'hidden'}</li>
          <li>Panel 2: {showPanel2 ? 'visible' : 'hidden'}</li>
          <li>Panel 3: {showPanel3 ? 'visible' : 'hidden'}</li>
        </ul>
      </div>
    </div>
  );
}
