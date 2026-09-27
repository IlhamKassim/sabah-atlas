// Fonts come as TTF (the only format ImageResponse reads): the logo's Bricolage Grotesque 700 and the
// site's IBM Plex Sans, set as the base face so the brand face never leaks into body text. Offline
// builds fall back to the default face.
async function googleFont(family: string, weight: number): Promise<ArrayBuffer> {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`)).text();
  const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
  if (!url) throw new Error(`no TTF for ${family}`);
  return (await fetch(url)).arrayBuffer();
}

export async function ogFonts() {
  try {
    const [plex, brand] = await Promise.all([googleFont("IBM+Plex+Sans", 400), googleFont("Bricolage+Grotesque", 700)]);
    return [
      { name: "Plex", data: plex, weight: 400 as const },
      { name: "Bricolage", data: brand, weight: 700 as const },
    ];
  } catch {
    return undefined;
  }
}
