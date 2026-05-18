describe("security and theme regression", () => {
  it("emits browser security headers on SSR routes", () => {
    cy.request("/privacy-policy").then((response) => {
      expect(response.headers["content-security-policy"]).to.include("base-uri 'self'");
      expect(response.headers["content-security-policy"]).to.include("object-src 'none'");
      expect(response.headers["content-security-policy"]).to.include("frame-ancestors 'none'");
      expect(response.headers["referrer-policy"]).to.eq("strict-origin-when-cross-origin");
      expect(response.headers["x-content-type-options"]).to.eq("nosniff");
    });
  });

  it("keeps the legal footer on a dark surface in dark mode", () => {
    const assertDarkFooter = () => {
      cy.get("footer").should(($footer) => {
        expect(getComputedStyle($footer[0]).backgroundColor).to.eq("rgb(16, 17, 19)");
        expect(getComputedStyle($footer[0]).borderTopColor).to.eq("rgba(255, 255, 255, 0.08)");
      });
    };

    cy.visit("/privacy-policy", {
      onBeforeLoad(win) {
        win.localStorage.setItem("tv-theme-mode", "dark");
      },
    });

    cy.contains("h1", "Privacy Policy").should("be.visible");
    assertDarkFooter();
    cy.reload();
    cy.contains("h1", "Privacy Policy").should("be.visible");
    assertDarkFooter();
    cy.contains("footer", "Privacy Policy").should("be.visible");
    cy.contains("footer", "Terms of Service").should("be.visible");
  });
});
