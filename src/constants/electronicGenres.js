// src/constants/electronicGenres.js
export const ELECTRONIC_GENRES = [
  'Techno / Electronic',
  'Hard Techno',
  'Schranz',
  'Tech House',
  'Melodic Techno',
  'House',
  'Drum & Bass',
  'Dubstep',
  'Trance',
  'Industrial / Acid'
];

export const ELECTRONIC_GENRE_OPTIONS = ELECTRONIC_GENRES.map((g) => ({
  value: g,
  label: g
}));