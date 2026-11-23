const { getSupabaseClient } = require("../../modules/utilisateurs/auth.service");

const PLAFOND_PROJET_KZ = 50000;
const PLAFOND_CUMULE_KZ = 50000;

async function obtenirStatutAbsence() {
  const supabase = getSupabaseClient();

  const { data: etat, error } = await supabase
    .from("absence_super_admin")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    const err = new Error("Impossible de récupérer le statut d'absence.");
    err.statusCode = 500;
    err.code = "ABSENCE_STATUS_ERROR";
    throw err;
  }

  const absenceActive = Boolean(etat && etat.absence_active);
  const montantCumuleUtiliseKz = Number(etat?.montant_cumule_utilise_kz || 0);
  const montantCumuleRestantKz = Math.max(0, PLAFOND_CUMULE_KZ - montantCumuleUtiliseKz);

  return {
    absence_active: absenceActive,
    responsable_confiance_id: etat?.responsable_confiance_id || null,
    plafond_projet_kz: PLAFOND_PROJET_KZ,
    plafond_cumule_kz: PLAFOND_CUMULE_KZ,
    montant_cumule_utilise_kz: montantCumuleUtiliseKz,
    montant_cumule_restant_kz: montantCumuleRestantKz
  };
}

async function activerAbsence(acteur, donnees = {}) {
  const responsableConfianceId = String(donnees.responsable_confiance_id || "").trim();
  if (!responsableConfianceId) {
    const err = new Error("Le champ responsable_confiance_id est obligatoire pour activer l'absence.");
    err.statusCode = 400;
    err.code = "MISSING_TRUSTED_LEAD";
    throw err;
  }

  const supabase = getSupabaseClient();

  const { data: responsable, error: respError } = await supabase
    .from("utilisateurs")
    .select("id, role_code, pole_id, nom")
    .eq("id", responsableConfianceId)
    .maybeSingle();

  if (respError || !responsable) {
    const err = new Error("Responsable de confiance introuvable.");
    err.statusCode = 404;
    err.code = "TRUSTED_LEAD_NOT_FOUND";
    throw err;
  }

  if (String(responsable.role_code || "").toUpperCase() !== "RESPONSABLE_POLE") {
    const err = new Error("Le responsable de confiance doit avoir le rôle RESPONSABLE_POLE.");
    err.statusCode = 400;
    err.code = "INVALID_TRUSTED_LEAD_ROLE";
    throw err;
  }

  const payload = {
    absence_active: true,
    responsable_confiance_id: responsable.id,
    active_par_id: acteur.id,
    montant_cumule_utilise_kz: 0,
    updated_at: new Date().toISOString()
  };

  const { data: existant } = await supabase
    .from("absence_super_admin")
    .select("id")
    .limit(1)
    .maybeSingle();

  const query = existant
    ? supabase.from("absence_super_admin").update(payload).eq("id", existant.id)
    : supabase.from("absence_super_admin").insert(payload);

  const { error } = await query;
  if (error) {
    const err = new Error("Impossible d'activer le mode absence.");
    err.statusCode = 500;
    err.code = "ACTIVATE_ABSENCE_FAILED";
    throw err;
  }

  return obtenirStatutAbsence();
}

async function desactiverAbsence(acteur) {
  const supabase = getSupabaseClient();

  const { data: existant } = await supabase
    .from("absence_super_admin")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existant) {
    const { error } = await supabase
      .from("absence_super_admin")
      .update({
        absence_active: false,
        desactive_par_id: acteur.id,
        montant_cumule_utilise_kz: 0,
        updated_at: new Date().toISOString()
      })
      .eq("id", existant.id);

    if (error) {
      const err = new Error("Impossible de désactiver le mode absence.");
      err.statusCode = 500;
      err.code = "DEACTIVATE_ABSENCE_FAILED";
      throw err;
    }
  }

  return obtenirStatutAbsence();
}

async function validerPaiementAbsence(acteur, donnees = {}) {
  const montantKz = Number(donnees.montant_kz);
  const projetId = donnees.projet_id || null;

  if (!Number.isFinite(montantKz) || montantKz <= 0) {
    const err = new Error("Le montant_kz doit être supérieur à 0.");
    err.statusCode = 400;
    err.code = "INVALID_AMOUNT";
    throw err;
  }

  if (montantKz > PLAFOND_PROJET_KZ) {
    const err = new Error(`Le montant dépasse le plafond par projet de ${PLAFOND_PROJET_KZ} Kz en mode absence.`);
    err.statusCode = 400;
    err.code = "PROJECT_CAP_EXCEEDED";
    throw err;
  }

  const statut = await obtenirStatutAbsence();

  if (!statut.absence_active && acteur.role_code !== "SUPER_ADMIN") {
    const err = new Error("Le mode absence du Super-Admin n'est pas actif.");
    err.statusCode = 403;
    err.code = "ABSENCE_MODE_INACTIVE";
    throw err;
  }

  if (
    acteur.role_code === "RESPONSABLE_POLE" &&
    statut.responsable_confiance_id &&
    statut.responsable_confiance_id !== acteur.id
  ) {
    const err = new Error("Vous n'êtes pas désigné comme responsable de confiance actif.");
    err.statusCode = 403;
    err.code = "NOT_TRUSTED_LEAD";
    throw err;
  }

  if (montantKz > statut.montant_cumule_restant_kz) {
    const err = new Error(
      `Plafond cumulé dépassé : disponible ${statut.montant_cumule_restant_kz} Kz (max ${PLAFOND_CUMULE_KZ} Kz).`
    );
    err.statusCode = 400;
    err.code = "CUMULATIVE_CAP_EXCEEDED";
    throw err;
  }

  const nouveauCumulUtilise = statut.montant_cumule_utilise_kz + montantKz;
  const supabase = getSupabaseClient();

  const { data: existant } = await supabase
    .from("absence_super_admin")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existant) {
    const { error } = await supabase
      .from("absence_super_admin")
      .update({
        montant_cumule_utilise_kz: nouveauCumulUtilise,
        updated_at: new Date().toISOString()
      })
      .eq("id", existant.id);

    if (error) {
      const err = new Error("Impossible de mettre à jour le plafond cumulé d'absence.");
      err.statusCode = 500;
      err.code = "ABSENCE_CAP_UPDATE_FAILED";
      throw err;
    }
  }

  return {
    projet_id: projetId,
    montant_valide_kz: montantKz,
    plafond_projet_kz: PLAFOND_PROJET_KZ,
    plafond_cumule_kz: PLAFOND_CUMULE_KZ,
    montant_cumule_utilise_kz: nouveauCumulUtilise,
    montant_cumule_restant_kz: Math.max(0, PLAFOND_CUMULE_KZ - nouveauCumulUtilise),
    valide_par_id: acteur.id
  };
}

module.exports = {
  PLAFOND_PROJET_KZ,
  PLAFOND_CUMULE_KZ,
  obtenirStatutAbsence,
  activerAbsence,
  desactiverAbsence,
  validerPaiementAbsence
};
