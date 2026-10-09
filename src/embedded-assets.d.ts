declare module "embedded-assets" {
  const assets: Record<string, { data: string; size: number }>;
  export default assets;
}
