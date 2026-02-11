const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const addonDir = path.join(rootDir, 'native', 'system-audio-addon');
const outputDir = path.join(rootDir, 'electron', 'native');
const builtAddonPath = path.join(addonDir, 'build', 'Release', 'system_audio.node');
const pointerPath = path.join(outputDir, 'system_audio.current.json');

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Busy wait for short retry windows.
  }
}

function copyAddonWithRetry(fromPath, toPath) {
  const maxAttempts = 20;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      fs.copyFileSync(fromPath, toPath);
      return;
    } catch (error) {
      const retryable = error && (error.code === 'EBUSY' || error.code === 'EPERM');
      if (!retryable || attempt === maxAttempts) {
        throw error;
      }
      sleepSync(250);
    }
  }
}

function listVersionedAddons(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((name) => /^system_audio-.*\.node$/i.test(name))
    .map((name) => ({
      name,
      fullPath: path.join(dirPath, name),
      mtimeMs: fs.statSync(path.join(dirPath, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function pruneOldVersionedAddons(dirPath, keepCount = 4) {
  const files = listVersionedAddons(dirPath);
  files.slice(keepCount).forEach((file) => {
    try {
      fs.unlinkSync(file.fullPath);
    } catch (_err) {
      // Ignore cleanup failures for locked files.
    }
  });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function findVcvars64() {
  const editions = ['BuildTools', 'Community', 'Professional', 'Enterprise'];
  const roots = [
    'C:\\Program Files\\Microsoft Visual Studio\\18',
    'C:\\Program Files\\Microsoft Visual Studio\\17',
  ];

  for (const root of roots) {
    for (const edition of editions) {
      const candidate = path.join(root, edition, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function patchNodeGypForVisualStudio18(nodeGypPath) {
  const finderPath = path.join(path.dirname(nodeGypPath), '..', 'lib', 'find-visualstudio.js');
  if (!fs.existsSync(finderPath)) {
    return;
  }

  let source = fs.readFileSync(finderPath, 'utf8');
  if (source.includes('ret.versionMajor === 18')) {
    return;
  }

  const replacements = [
    [
      'return this.findVSFromSpecifiedLocation([2019, 2022])',
      'return this.findVSFromSpecifiedLocation([2019, 2022, 2026])',
    ],
    [
      'return this.findNewVSUsingSetupModule([2019, 2022])',
      'return this.findNewVSUsingSetupModule([2019, 2022, 2026])',
    ],
    [
      'return this.findNewVS([2019, 2022])',
      'return this.findNewVS([2019, 2022, 2026])',
    ],
    [
      "if (ret.versionMajor === 17) {\n      ret.versionYear = 2022\n      return ret\n    }",
      "if (ret.versionMajor === 17) {\n      ret.versionYear = 2022\n      return ret\n    }\n    if (ret.versionMajor === 18) {\n      ret.versionYear = 2026\n      return ret\n    }",
    ],
    [
      "} else if (versionYear === 2022) {\n      return 'v143'\n    }",
      "} else if (versionYear === 2022) {\n      return 'v143'\n    } else if (versionYear === 2026) {\n      return 'v145'\n    }",
    ],
  ];

  let changed = false;
  for (const [needle, value] of replacements) {
    if (source.includes(needle)) {
      source = source.replace(needle, value);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(finderPath, source, 'utf8');
    console.log('Patched node-gyp Visual Studio detection for VS 2026 (v18).');
  }
}

function runNodeGypWithVcvars(nodeGypPath, electronVersion, cwd) {
  const vcvarsPath = findVcvars64();
  if (!vcvarsPath) {
    return false;
  }

  console.log(`Using VC toolchain from: ${vcvarsPath}`);
  const tempScriptPath = path.join(cwd, '.build-native-temp.cmd');
  const scriptContent = [
    '@echo off',
    `call "${vcvarsPath}"`,
    'if errorlevel 1 exit /b %errorlevel%',
    `"${process.execPath}" "${nodeGypPath}" rebuild --target=${electronVersion} --dist-url=https://electronjs.org/headers --arch=${process.arch}`,
  ].join('\r\n');
  fs.writeFileSync(tempScriptPath, scriptContent, 'utf8');

  const result = spawnSync('cmd.exe', ['/d', '/c', tempScriptPath], {
    cwd,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  try {
    fs.unlinkSync(tempScriptPath);
  } catch (_err) {
    // Ignore temp script cleanup errors.
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  return true;
}

function getElectronVersion() {
  const electronPackagePath = path.join(rootDir, 'node_modules', 'electron', 'package.json');
  if (!fs.existsSync(electronPackagePath)) {
    console.error('Electron is not installed. Run npm install first.');
    process.exit(1);
  }

  const electronPkg = JSON.parse(fs.readFileSync(electronPackagePath, 'utf8'));
  return electronPkg.version;
}

function ensureNodeGypPath() {
  const nodeGypPath = path.join(rootDir, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js');
  if (!fs.existsSync(nodeGypPath)) {
    console.error('node-gyp is missing. Run npm install first.');
    process.exit(1);
  }
  return nodeGypPath;
}

function main() {
  if (!fs.existsSync(addonDir)) {
    console.error(`Native addon folder not found: ${addonDir}`);
    process.exit(1);
  }

  const electronVersion = getElectronVersion();
  const nodeGypPath = ensureNodeGypPath();
  patchNodeGypForVisualStudio18(nodeGypPath);

  console.log(`Building native system audio addon for Electron ${electronVersion}...`);
  const usedVcvars = runNodeGypWithVcvars(nodeGypPath, electronVersion, addonDir);
  if (!usedVcvars) {
    run(
      process.execPath,
      [
        nodeGypPath,
        'rebuild',
        `--target=${electronVersion}`,
        '--dist-url=https://electronjs.org/headers',
        `--arch=${process.arch}`,
      ],
      addonDir
    );
  }

  if (!fs.existsSync(builtAddonPath)) {
    console.error(`Build output not found: ${builtAddonPath}`);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const targetFileName = `system_audio-${electronVersion}-${Date.now()}.node`;
  const targetPath = path.join(outputDir, targetFileName);

  copyAddonWithRetry(builtAddonPath, targetPath);
  fs.writeFileSync(pointerPath, JSON.stringify({ file: targetFileName }, null, 2), 'utf8');
  pruneOldVersionedAddons(outputDir, 4);

  console.log(`Native addon copied to ${targetPath}`);
  console.log(`Pointer file updated: ${pointerPath}`);
}

main();
