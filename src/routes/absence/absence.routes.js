const express = require("express");
const { verifierToken } = require("../../middleware/auth");
const { securiserAcces } = require("../../middleware/roles");
const {
  obtenirStatutAbsence,
  activerAbsence,
  desactiverAbsence,
  validerPaiementAbsence
} = require("./absence.service");

const router = express.Router();

// GET /api/v1/absence/statut — SUPER_ADMIN + RESPONSABLE_POLE
router.get(
  "/statut",
  verifierToken,
  securiserAcces(["SUPER_ADMIN", "RESPONSABLE_POLE"]),
  async (req, res, next) => {
    try {
      const statut = await obtenirStatutAbsence();
      return res.status(200).json(statut);
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/v1/absence/activer — SUPER_ADMIN seul
router.post(
  "/activer",
  verifierToken,
  securiserAcces(["SUPER_ADMIN"]),
  async (req, res, next) => {
    try {
      const resultat = await activerAbsence(req.utilisateur, req.body || {});
      return res.status(200).json({
        message: "Mode absence activé.",
        ...resultat
      });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/v1/absence/desactiver — SUPER_ADMIN seul
router.post(
  "/desactiver",
  verifierToken,
  securiserAcces(["SUPER_ADMIN"]),
  async (req, res, next) => {
    try {
      const resultat = await desactiverAbsence(req.utilisateur);
      return res.status(200).json({
        message: "Mode absence désactivé.",
        ...resultat
      });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/v1/absence/valider-paiement — SUPER_ADMIN + RESPONSABLE_POLE
router.post(
  "/valider-paiement",
  verifierToken,
  securiserAcces(["SUPER_ADMIN", "RESPONSABLE_POLE"]),
  async (req, res, next) => {
    try {
      const resultat = await validerPaiementAbsence(req.utilisateur, req.body || {});
      return res.status(200).json({
        message: "Paiement validé en mode absence.",
        ...resultat
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
