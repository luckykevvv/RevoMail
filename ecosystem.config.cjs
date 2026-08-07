module.exports = {
  apps: [
    {
      name: "revomail",
      script: "scripts/python-runtime.mjs",
      args: "-m backend.run",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
      time: true
    }
  ]
};
