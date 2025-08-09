#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Recursively find files matching patterns
 */
function findFiles(dir, patterns, ignorePatterns = []) {
  const results = [];
  
  function searchDir(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const relativePath = path.relative(process.cwd(), fullPath);
        
        // Skip ignored directories
        if (ignorePatterns.some(pattern => relativePath.includes(pattern))) {
          continue;
        }
        
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          searchDir(fullPath);
        } else if (stat.isFile()) {
          // Check if file matches any pattern
          for (const pattern of patterns) {
            if (matchesPattern(item, pattern)) {
              results.push(fullPath);
              break;
            }
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }
  
  searchDir(dir);
  return results;
}

/**
 * Simple pattern matching for file names
 */
function matchesPattern(filename, pattern) {
  // Convert simple glob patterns to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filename);
}

/**
 * Clean up test artifacts after test runs
 */
function cleanupTestArtifacts() {
  console.log('🧹 Cleaning up test artifacts...');
  
  let cleanedFiles = 0;
  const ignorePatterns = ['node_modules', '.git', '.kiro'];
  
  try {
    // Clean up backup database files
    const backupFiles = findFiles(process.cwd(), ['*.db.backup.*'], ignorePatterns);
    
    backupFiles.forEach(file => {
      try {
        fs.unlinkSync(file);
        console.log(`   ✓ Removed backup file: ${path.basename(file)}`);
        cleanedFiles++;
      } catch (error) {
        console.warn(`   ⚠️  Failed to remove ${path.basename(file)}: ${error.message}`);
      }
    });
    
    // Clean up test database files
    const testDbFiles = findFiles(process.cwd(), ['test_*.db'], ignorePatterns);
    
    testDbFiles.forEach(file => {
      try {
        fs.unlinkSync(file);
        console.log(`   ✓ Removed test database: ${path.basename(file)}`);
        cleanedFiles++;
      } catch (error) {
        console.warn(`   ⚠️  Failed to remove ${path.basename(file)}: ${error.message}`);
      }
    });
    
    // Clean up any temporary test files
    const tempTestFiles = findFiles(process.cwd(), ['test_*.json', 'test_*.log', 'test_*.tmp'], ignorePatterns);
    
    tempTestFiles.forEach(file => {
      try {
        fs.unlinkSync(file);
        console.log(`   ✓ Removed temp file: ${path.basename(file)}`);
        cleanedFiles++;
      } catch (error) {
        console.warn(`   ⚠️  Failed to remove ${path.basename(file)}: ${error.message}`);
      }
    });
    
    if (cleanedFiles === 0) {
      console.log('   ✨ No test artifacts to clean up');
    } else {
      console.log(`   ✨ Cleaned up ${cleanedFiles} test artifact${cleanedFiles === 1 ? '' : 's'}`);
    }
    
  } catch (error) {
    console.error('❌ Error during test cleanup:', error.message);
    process.exit(1);
  }
}

// Run cleanup if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Test Cleanup Script');
    console.log('');
    console.log('Usage:');
    console.log('  node utils/test-cleanup.js            Clean up test artifacts');
    console.log('  npm run test:cleanup                  Clean up test artifacts');
    console.log('  npm run test:clean                    Clean up test artifacts (alias)');
    console.log('');
    console.log('This script removes:');
    console.log('  - Database backup files (*.db.backup.*)');
    console.log('  - Test database files (test_*.db)');
    console.log('  - Temporary test files (test_*.json, test_*.log, test_*.tmp)');
    process.exit(0);
  }
  
  cleanupTestArtifacts();
}

module.exports = { cleanupTestArtifacts };