import nodemailer from 'nodemailer';

export function createEmailSender(config) {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    pool: true,
    maxConnections: 2,
    auth: {user: config.user, pass: config.password},
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    tls: {minVersion: 'TLSv1.2'},
  });
  return async ({to, code}) => {
    await transport.sendMail({
      from: {name: config.fromName, address: config.user},
      to,
      subject: '游戏星球登录验证码',
      text: `你的游戏星球登录验证码是 ${code}，5 分钟内有效。请勿将验证码告诉他人。`,
      html: `<p>你的游戏星球登录验证码是：</p><p style="font:700 32px/1.2 monospace;letter-spacing:6px">${code}</p><p>验证码 5 分钟内有效，请勿将验证码告诉他人。</p>`,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  };
}
