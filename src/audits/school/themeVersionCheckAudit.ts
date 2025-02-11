"use strict";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import lighthouse from "lighthouse";
import semver from "semver";
import { CheerioAPI } from "cheerio";
import {
  buildUrl,
  cmsThemeRx,
  isInternalUrl,
  loadPageData,
} from "../../utils/utils";
import { auditDictionary } from "../../storage/auditDictionary";
import axios from "axios";

const Audit = lighthouse.Audit;

const auditId = "school-ux-ui-consistency-theme-version-check";
const auditData = auditDictionary[auditId];

const greenResult = auditData.greenResult;
const yellowResult = auditData.yellowResult;
const redResult = auditData.redResult;

class LoadAudit extends Audit {
  static get meta() {
    return {
      id: auditId,
      title: auditData.title,
      failureTitle: auditData.failureTitle,
      description: auditData.description,
      scoreDisplayMode: Audit.SCORING_MODES.NUMERIC,
      requiredArtifacts: ["origin"],
    };
  }

  static async audit(
    artifacts: LH.Artifacts & { origin: string }
  ): Promise<{ score: number; details: LH.Audit.Details.Table }> {
    const url = artifacts.origin;

    let score = 0.5;
    const headings = [
      {
        key: "result",
        itemType: "text",
        text: "Risultato",
      },
      {
        key: "cms_name",
        itemType: "text",
        text: "Tema CMS del modello in uso",
      },
      {
        key: "theme_version",
        itemType: "text",
        text: "Versione del tema CMS in uso",
      },
      {
        key: "checked_element",
        itemType: "text",
        text: "Elemento controllato",
      },
    ];

    const items = [
      {
        result: yellowResult,
        cms_name: "Nessuno",
        theme_version: "N/A",
        checked_element: "",
      },
    ];

    const $: CheerioAPI = await loadPageData(url);
    const linkTags = $("link");

    let styleCSSurl = "";
    for (const linkTag of linkTags) {
      if (!linkTag.attribs || !("href" in linkTag.attribs)) {
        continue;
      }

      let styleFound = false;
      const styleParts = linkTag.attribs.href.split("/");
      for (const stylePart of styleParts) {
        if (stylePart.includes("style.css")) {
          const filenameParts = stylePart.split("?");
          if (filenameParts[0] === "style.css") {
            styleFound = true;
          }
        }
      }

      if (styleFound) {
        styleCSSurl = linkTag.attribs.href;
        if ((await isInternalUrl(styleCSSurl)) && !styleCSSurl.includes(url)) {
          styleCSSurl = await buildUrl(url, styleCSSurl);
        }
        items[0].checked_element = styleCSSurl;

        let CSScontent = "";
        try {
          const response = await axios.get(styleCSSurl);
          CSScontent = response.data;
        } catch (e) {
          CSScontent = "";
        }

        const match = CSScontent.match(cmsThemeRx);

        if (match === null || !match.groups) {
          score = 0.5;
          items[0].result = yellowResult;

          break;
        }

        items[0].cms_name = match.groups.name;
        const version = match.groups.version;
        items[0].theme_version = version;

        score = 0;
        items[0].result = redResult;

        if (semver.gte(version, "2.0.0")) {
          score = 1;
          items[0].result = greenResult;
        }
        break;
      }
    }

    return {
      score: score,
      details: Audit.makeTableDetails(headings, items),
    };
  }
}

module.exports = LoadAudit;
