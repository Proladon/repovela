const palette = [
  '#55c4d0',
  '#78c999',
  '#bb91e8',
  '#e3c378',
  '#df8888',
  '#7bcedd',
  '#a0d38a',
  '#d79ada',
  '#e6da99',
  '#87a9f6',
  '#f0a491',
  '#888d9a',
];

export const graphColor = (index: number) => palette[index % palette.length];
