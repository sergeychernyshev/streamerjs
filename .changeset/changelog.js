// The GitHub changelog generator thanks whoever authored a change. Thanking
// ourselves in our own changelog reads oddly, so entries by a maintainer keep
// the pull request and commit links but drop the thanks.
//
// Maintainers are read from .github/CODEOWNERS to keep one list instead of two.
// Note that this covers every code owner, including anyone who only owns a
// single path, so add an outside contributor there and they stop being thanked.
import fs from "fs";
import path from "path";
import url from "url";

import githubChangelog from "@changesets/changelog-github";

const codeownersPath = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "..",
  ".github",
  "CODEOWNERS",
);

// matches the " Thanks [@someone](https://github.com/someone)!" the generator adds
const thanks = /\s*Thanks \[@([^\]]+)\]\([^)]*\)!/g;

// @login owners, ignoring comments, path patterns, e-mail owners and @org/team
// references, which are not GitHub logins we could match an author against
function readMaintainers() {
  let codeowners;

  try {
    codeowners = fs.readFileSync(codeownersPath, "utf8");
  } catch {
    // without the file we cannot tell maintainers apart, so thank everyone
    return [];
  }

  return codeowners
    .split("\n")
    .map((line) => line.split("#")[0])
    .flatMap((line) => line.split(/\s+/))
    .filter((entry) => /^@[^/]+$/.test(entry))
    .map((entry) => entry.slice(1).toLowerCase());
}

export default {
  getDependencyReleaseLine: githubChangelog.getDependencyReleaseLine,

  async getReleaseLine(changeset, type, options) {
    const line = await githubChangelog.getReleaseLine(changeset, type, options);
    const maintainers = readMaintainers();

    return line.replace(thanks, (thanksText, user) =>
      maintainers.includes(user.toLowerCase()) ? "" : thanksText,
    );
  },
};
