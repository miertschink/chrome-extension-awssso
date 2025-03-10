var defaultcolorjson = {
  ".*production.*": "maroon",
  ".*Production.*": "maroon",
  "^SomeStrings.*": "darkblue",
};

var defaultfavsjson = {
  favorites: [
    "123456789012-sample",
    "111111111111-sample",
    "222222222222-sample",
  ],
};

window.addEventListener("load", function () {
  const { hostname, pathname } = window.location;
  if (hostname.endsWith(".awsapps.com") && pathname.startsWith("/start")) {
    // AWS SSO portal
    saveDataOnSSOAppExpansion();
  } else if (
    hostname.includes("console.aws.amazon.com") ||
    hostname.includes("health.aws.amazon.com")
  ) {
    // AWS Console (including PHD)
    changeConsoleHeaderAndFooter();
  }
});

// Helper function for waiting until an element selection has been rendered.
function onElementReady(selectorFn, fn) {
  let timedOut = false;
  setTimeout(function () {
    timedOut = true;
  }, 30000);
  const waitForElement = function () {
    if (timedOut) {
      fn(new Error("Element selection timed out."));
    }
    const selection = selectorFn();
    const firstEl = Array.isArray(selection) ? selection[0] : selection;
    firstEl
      ? fn(undefined, selection)
      : window.requestAnimationFrame(waitForElement);
  };
  waitForElement();
}

function saveDataOnSSOAppExpansion() {
  const awsAccountsAppSelector = () =>
      document.querySelector('div[data-testid="account-list"]');
  onElementReady(awsAccountsAppSelector, function (err, awsAccountsApp) {
    if (err) {
      console.error(err);
      return;
    }
    saveAccountNames();
    makeFavs();

    // re-sort favorites after filter was cleared
    let filterInput = document.querySelector('input[type="search"]');
    filterInput.addEventListener('change', (event) => {
        setTimeout(() => makeFavs(), 50)
    });
    filterInput.addEventListener('input', (event) => {
        setTimeout(() => makeFavs(), 50)
    });
  });
}

function makeFavs() {
  chrome.storage.local.get("ce_aws_sso_favorites", function (items) {
    var favs = defaultfavsjson;
    if (items.ce_aws_sso_favorites) {
      favs = items.ce_aws_sso_favorites;
    }
    if (favs.favorites) {
      sortFavs(favs.favorites);
    }
  });
}

function sortFavs(arFavs) {
  const accountsSelector = () =>
      Array.from(document.querySelectorAll('button[data-testid="account-list-cell"]'));
  onElementReady(accountsSelector, function (err, accountElements) {
    if (err) {
      console.error(err);
      return;
    }

    const target = document.querySelector('div[data-testid="account-list"]');

    arFavsRev = arFavs.reverse();
    iconurl = chrome.runtime.getURL("icons/fav.png");

    for (const favid of arFavsRev) {
      for (const el of accountElements) {
        const childDivs = el.querySelectorAll("div");
        let accountId = "";
        Array.from(childDivs).map((value, index, array) => {
          accountId = value.textContent.match(/\d{12}/);

        })
        accountId = accountId.toString();
        if (accountId === favid) {
          // Move the favorites account element to the beginning of the list
          target.insertBefore(el.parentNode.parentNode, target.firstChild);
          const favImg = document.createElement("img");
          favImg.src = iconurl;
          const svg = getFavSvg();
          const svgElements = el.querySelectorAll("svg");
          el.querySelectorAll("svg")[1].replaceWith(svg);
          break;
        }
      }
    }
  });
}

// renders a svg star icon
function getFavSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "19");
  svg.setAttribute("viewBox", "0 0 16 19");
  svg.innerHTML = `<path fill="#FFD700" d="M8 0.5L9.972 5.5H15l-4 3.5 1.528 5.5L8 11.5l-4.528 3.5L5 9 1 5.5h5.028L8 0.5z"/>`;
  return svg;
}

function saveAccountNames() {
  const accountsSelector = () =>
      Array.from(document.querySelectorAll('button[data-testid="account-list-cell"]'));
  onElementReady(accountsSelector, function (err, accountElements) {
    if (err) {
      console.error(err);
      return;
    }
    const accountMap = accountElements.reduce((map, el) => {
      const name = el.querySelector("strong").textContent;
      const childDivs = el.querySelectorAll("div");
      Array.from(childDivs).map(el => {
        const id = el.textContent.match(/\d{12}/);
        if (id) {
          map[id] = name;
        }
      })
      return map;
    }, {});

    chrome.runtime.sendMessage(
      { method: "saveSSOData", data: accountMap },
      function (response) {
        console.log("Saved SSO data to LocalStorage for Console augmentation.");
      }
    );
  });
}

function changeConsoleHeaderAndFooter() {
  const consoleFederatedLoginPattern = /AWSReservedSSO_(.+)_(.+)/;
  // show AWS SSO data to AWS console header
  chrome.runtime.sendMessage({ method: "getSSOData" }, function (response) {
    if (!(response && response.data)) {
      return;
    }
    const accountMap = response.data.data;
    const labelSelector = () =>
      document.querySelector(
        "span[data-testid='awsc-nav-account-menu-button']"
      );

    onElementReady(labelSelector, function (err, label) {
      if (err) {
        // console.warn("Ending SSO title update attempts.");
        return;
      }

      label = label.querySelector("span");

      const accountIdDivSelector = () =>
        document.querySelector("div[data-testid='account-detail-menu']");

      onElementReady(accountIdDivSelector, function (err, accountIdDiv) {
        if (err) {
          return;
        }

        const accountIds = accountIdDiv.querySelectorAll("span");

        var accountId = "";
        const isNumberRegexp = new RegExp(/^[0-9]+(\.[0-9]+)?$/);
        for (span of accountIds) {
          const accountIdTmp = span.innerText.replaceAll("-", "");
          if (isNumberRegexp.test(accountIdTmp) && accountIdTmp.length == 12) {
            accountId = accountIdTmp;
            break;
          }
        }
        if (!accountId) {
          return;
        }

        var roleName = "";
        for (span of accountIds) {
          const accountDetail = span.innerText
            .split("/")[0]
            .match(consoleFederatedLoginPattern);
          if (accountDetail && accountDetail.length > 1) {
            roleName = accountDetail[1];
            break;
          }
        }
        if (!roleName) {
          return;
        }

        const accountName = accountMap[accountId];
        const text = `SSO: ${roleName} @ ${accountName} (${accountId})`;
        label.innerText = text;

        chrome.storage.local.get("ce_aws_sso_colors", function (items) {
          var colors = defaultcolorjson;
          if (items.ce_aws_sso_colors) {
            colors = items.ce_aws_sso_colors;
          }
          for (var regexp in colors) {
            re = new RegExp(regexp);
            if (re.test(accountName)) {
              const headerSelector = () =>
                document.querySelector("header").querySelector("nav");
              onElementReady(headerSelector, function (err, header) {
                if (err) {
                  // console.warn(err);
                  return;
                }
                header.style.backgroundColor = colors[regexp];
              });
              const footerSelector = () =>
                document.querySelector("div[id='console-nav-footer-inner']");
              onElementReady(footerSelector, function (err, footer) {
                if (err) {
                  return;
                }
                footer.style.backgroundColor = colors[regexp];
              });
            }
          }
        });
      });
    });
  });
}
