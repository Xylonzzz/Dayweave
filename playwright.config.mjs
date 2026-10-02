import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:'**/*.spec.mjs',fullyParallel:false,workers:1,
  timeout:30000,outputDir:'test-output/browser',reporter:'list',
  use:{baseURL:'http://localhost:3098',channel:'msedge',headless:true,viewport:{width:1440,height:1000},screenshot:'only-on-failure'}
});
