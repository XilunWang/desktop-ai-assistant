// 启动 Electron，先确保 ELECTRON_RUN_AS_NODE 被删除（系统/会话里可能被设为 1，导致 Electron 跑成 Node 模式）
delete process.env.ELECTRON_RUN_AS_NODE;
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron'); // 这里 electron 是可执行文件路径字符串

const proc = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: process.env,
  cwd: path.join(__dirname, '..')
});

proc.on('close', (code) => {
  process.exit(code ?? 0);
});
