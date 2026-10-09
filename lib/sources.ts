// Where the lesson's facts come from: shown on /sources ("View sources" under
// the lesson) and on the last page of the editor's PDF.

export type Source = { title: string; org: string; url: string };

export const SOURCES: Source[] = [
  {
    title: "Chesapeake Bay Blue Catfish: Invasive, but Delicious and Nutritious! (FS-1142)",
    org: "University of Maryland Extension",
    url: "https://extension.umd.edu/resource/chesapeake-bay-blue-catfish-invasive-delicious-and-nutritious-fs-1142",
  },
  {
    title: "Blue Catfish",
    org: "Maryland Department of Natural Resources",
    url: "https://dnr.maryland.gov/fisheries/Pages/blue-catfish/blue_catfish_main.aspx",
  },
  {
    title: "Understanding the Chesapeake's catfish problem",
    org: "Chesapeake Bay Program",
    url: "https://www.chesapeakebay.net/news/blog/understanding-the-chesapeakes-catfish-problem",
  },
  {
    title: "Blue Catfish",
    org: "NOAA Fisheries",
    url: "https://www.fisheries.noaa.gov/species/blue-catfish",
  },
  {
    title: "Blue Catfish: Invasive and Delicious",
    org: "NOAA Fisheries",
    url: "https://www.fisheries.noaa.gov/feature-story/blue-catfish-invasive-and-delicious",
  },
  {
    title: "Blue Catfish — Field Guide",
    org: "Chesapeake Bay Program",
    url: "https://www.chesapeakebay.net/discover/field-guide/entry/blue-catfish",
  },
];
