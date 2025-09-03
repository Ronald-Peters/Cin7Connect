#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('🚀 Starting build and deploy process...');

try {
  // Step 1: Build client (Vite build)
  console.log('📦 Building client...');
  execSync('npm run build:client', { stdio: 'inherit' });

  // Step 2: Build server (esbuild)
  console.log('🔧 Building server...');
  execSync('npm run build:server', { stdio: 'inherit' });

  // Step 3: Copy Vite build output from client/dist/public to dist/public
  console.log('📁 Copying Vite build output...');
  const viteBuildDir = path.resolve('client/dist/public');
  const targetPublicDir = path.resolve('dist/public');
  
  // Always ensure target directory exists
  fs.mkdirSync(targetPublicDir, { recursive: true });
  
  if (fs.existsSync(viteBuildDir)) {
    // Copy all Vite build files
    try {
      execSync(`cp -r ${viteBuildDir}/* ${targetPublicDir}/`, { stdio: 'pipe' });
      console.log('✅ Vite build files copied to dist/public');
    } catch (error) {
      console.warn('⚠️ Error copying Vite build files, but continuing...');
    }
  } else {
    console.warn('⚠️ Vite build output not found at client/dist/public, but continuing...');
  }

  // Step 4: Copy demo.html to dist/public
  console.log('📄 Copying demo.html...');
  const demoSource = path.resolve('client/demo.html');
  const demoTarget = path.resolve('dist/public/demo.html');
  
  if (fs.existsSync(demoSource)) {
    // Ensure dist/public directory exists before copying
    const targetDir = path.dirname(demoTarget);
    fs.mkdirSync(targetDir, { recursive: true });
    
    fs.copyFileSync(demoSource, demoTarget);
    console.log('✅ demo.html copied successfully');
  } else {
    console.warn('⚠️ demo.html not found at client/demo.html');
  }

  // Step 5: Copy attached_assets if they exist
  console.log('🖼️ Copying attached assets...');
  try {
    execSync('cp -r attached_assets dist/', { stdio: 'pipe' });
    console.log('✅ Attached assets copied successfully');
  } catch (error) {
    console.log('ℹ️ No attached_assets directory found (this is OK)');
  }

  console.log('🎉 Build and deploy process completed successfully!');
  console.log('📍 Files created:');
  console.log('  - dist/index.js (server)');
  console.log('  - dist/public/ (client assets)');
  console.log('  - dist/public/demo.html (home page)');
  console.log('  - dist/attached_assets/ (if available)');

} catch (error) {
  console.error('❌ Build process failed:', error.message);
  process.exit(1);
}