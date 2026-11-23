const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("../modules/utilisateurs/auth.service");

function verifierToken(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      code: "MISSING_BEARER_TOKEN",
      message: "En-tête Authorization Bearer manquant ou mal formaté."
    });
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({
      code: "MISSING_BEARER_TOKEN",
      message: "Jeton Bearer vide."
    });
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const id = decoded.id || decoded.sub;
    const roleCode = decoded.role_code ? String(decoded.role_code).toUpperCase() : null;
    if (!id || !roleCode) {
      return res.status(401).json({
        code: "INVALID_TOKEN_PAYLOAD",
        message: "Payload du jeton invalide : identifiant ou rôle manquant."
      });
    }
    req.utilisateur = {
      id,
      role_code: roleCode,
      pole_id: decoded.pole_id || null,
      nom: decoded.nom || null,
      email: decoded.email || null
    };
    return next();
  } catch (err) {
    return res.status(401).json({
      code: "INVALID_OR_EXPIRED_TOKEN",
      message: "Jeton JWT invalide ou expiré."
    });
  }
}

module.exports = {
  verifierToken
};
