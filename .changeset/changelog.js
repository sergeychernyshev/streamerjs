// The GitHub changelog generator thanks whoever authored a change. Thanking
// ourselves in our own changelog reads oddly, so entries by the maintainers
// listed here keep the pull request and commit links but drop the thanks.
import githubChangelog from "@changesets/changelog-github";

const maintainers = ["sergeychernyshev"];

// matches the " Thanks [@someone](https://github.com/someone)!" the generator adds
const thanks = /\s*Thanks \[@([^\]]+)\]\([^)]*\)!/g;

export default {
  getDependencyReleaseLine: githubChangelog.getDependencyReleaseLine,

  async getReleaseLine(changeset, type, options) {
    const line = await githubChangelog.getReleaseLine(changeset, type, options);

    return line.replace(thanks, (thanksText, user) =>
      maintainers.includes(user.toLowerCase()) ? "" : thanksText,
    );
  },
};
