const express = require("express");
const { verifierToken } = require("../../middleware/auth");
const { securiserAcces } = require("../../middleware/roles");
const {
  listerProjets,
  creerProjet,
  enregistrerPaiement,
  confirmerPaiement
} = require("./paiements.service");

const router = express.Router();

// GET /api/v1/projets — 4 rôles, cloisonnement dans le service
router.get(
  "/projets",
  verifierToken,
  securiserAcces(["SUPER_ADMIN", "RESPONSABLE_POLE", "COLLABORATEUR", "CLIENT"]),
  async (req, res, next) => {
    try {
      const projets = await listerProjets(req.utilisateur);
      return res.status(200).json({ projets });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/v1/projets — SUPER_ADMIN + RESPONSABLE_POLE
router.post(
  "/projets",
  verifierToken,
  securiserAcces(["SUPER_ADMIN", "RESPONSABLE_POLE"], {
    getPoleId: (req) => req.body?.pole_id
  }),
  async (req, res, next) => {
    try {
      const projet = await creerProjet(req.utilisateur, req.body || {});
      return res.status(201).json({
        message: "Projet créé avec succès.",
        projet
      });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/v1/paiements — 4 rôles, génération reçu PKEN
router.post(
  "/paiements",
  verifierToken,
  securiserAcces(["SUPER_ADMIN", "RESPONSABLE_POLE", "COLLABORATEUR", "CLIENT"]),
  async (req, res, next) => {
    try {
      const resultat = await enregistrerPaiement(req.utilisateur, req.body || {});
      return res.status(201).json({
        message: "Paiement enregistré avec reçu PKEN.",
        ...resultat
      });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/v1/paiements/:id/confirmer — SUPER_ADMIN + RESPONSABLE_POLE
router.post(
  "/paiements/:id/confirmer",
  verifierToken,
  securiserAcces(["SUPER_ADMIN", "RESPONSABLE_POLE"]),
  async (req, res, next) => {
    try {
      const resultat = await confirmerPaiement(req.utilisateur, req.params.id);
      return res.status(200).json({
        message: "Paiement confirmé.",
        ...resultat
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
