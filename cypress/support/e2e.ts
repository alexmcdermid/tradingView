Cypress.on("uncaught:exception", (error) => {
  if (error.message.includes("Minified React error #418")) {
    return false;
  }
});
