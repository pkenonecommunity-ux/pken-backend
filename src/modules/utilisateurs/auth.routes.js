const express = require("express");
const { inscrireClient, connecterUtilisateur } = require("./auth.service");
const { verifierToken } = require("../../middleware/auth");

const router = express.Router();

router.post("/inscription", async (req, res, next) => {
  try {
    const resultat = await inscrireClient(req.body || {});
    return res.status(201).json({
      message: "Compte client créé avec succès.",
      ...resultat
    });
  } catch (err) {
    return next(err);
  }
});

router.post("/connexion", async (req, res, next) => {
  try {
    const resultat = await connecterUtilisateur(req.body || {});
    return res.status(200).json({
      message: "Connexion réussie.",
      ...resultat
    });
  } catch (err) {
    return next(err);
  }
});

router.get("/moi", verifierToken, (req, res) => {
  return res.status(200).json({
    utilisateur: req.utilisateur
  });
});

module.exports = router;
