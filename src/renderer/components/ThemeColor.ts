// Returns the right bg/color pair depending on current theme
export function getThemeColors(isDark: boolean, colorIdx: number) {
  const DARK = [
    { c: '#7B6FE8', bg: '#2D2860', text: '#C4BEFF' },
    { c: '#1D9E75', bg: '#0A2E1F', text: '#34D399' },
    { c: '#EF9F27', bg: '#2A1D08', text: '#FCD34D' },
    { c: '#D85A30', bg: '#2A1008', text: '#F09595' },
    { c: '#378ADD', bg: '#0A1E35', text: '#93C5FD' },
  ]
  const LIGHT = [
    { c: '#534AB7', bg: '#EEEDFE', text: '#3C3489' },
    { c: '#0F6E56', bg: '#E1F5EE', text: '#085041' },
    { c: '#BA7517', bg: '#FAEEDA', text: '#633806' },
    { c: '#993C1D', bg: '#FAECE7', text: '#712B13' },
    { c: '#1A5FA8', bg: '#E6F1FB', text: '#0C447C' },
  ]
  return isDark ? DARK[colorIdx % DARK.length] : LIGHT[colorIdx % LIGHT.length]
}
