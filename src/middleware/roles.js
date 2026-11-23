function securiserAcces(rolesAutorises = [], options = {}) {
  const rolesNormalises = Array.isArray(rolesAutorises)
    ? rolesAutorises.map((r) => String(r).toUpperCase())
    : [];
  const getPoleId = typeof options.getPoleId === "function" ? options.getPoleId : null;

  return (req, res, next) => {
    const utilisateur = req.utilisateur;

    if (!utilisateur || !utilisateur.id || !utilisateur.role_code) {
      return res.status(401).json({
        code: "UNAUTHORIZED",
        message: "Authentification requise."
      });
    }

    const roleActeur = String(utilisateur.role_code).toUpperCase();

    if (rolesNormalises.length > 0 && !rolesNormalises.includes(roleActeur)) {
      return res.status(403).json({
        code: "FORBIDDEN_ROLE",
        message: "Accès refusé : rôle insuffisant pour cette opération."
      });
    }

    if (getPoleId) {
      const poleCible = getPoleId(req);
      if (poleCible && roleActeur !== "SUPER_ADMIN" && utilisateur.pole_id !== poleCible) {
        return res.status(403).json({
          code: "FORBIDDEN_POLE_SCOPE",
          message: "Accès refusé : vous ne pouvez pas agir sur un autre pôle."
        });
      }
    }

    return next();
  };
}

module.exports = {
  securiserAcces
};
