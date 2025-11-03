// Minimal ambient declaration to allow compiling without installing nodemailer in dev.
declare module 'nodemailer' {
  export function createTransport(options: any): any;
  const _default: { createTransport: (options: any) => any };
  export default _default;
}

