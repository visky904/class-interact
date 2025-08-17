const BAD = ['fuck','shit','bitch','bastard','asshole','dick','piss','slut','whore','bloody','crap','damn'];
export const hasProfanity = (s='') => {
  const w = s.toLowerCase();
  return BAD.some(b => w.includes(b));
};
