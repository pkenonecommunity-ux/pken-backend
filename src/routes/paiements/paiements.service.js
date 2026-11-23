const crypto = require("crypto");
const { getSupabaseClient } = require("../../modules/utilisateurs/auth.service");

const STATUTS_VALIDES = new Set(["EN_ATTENTE_ACOMPTE", "EN_COURS", "SOLDE"]);
const EXCEPTION_ACOMPTE_MAX_KZ = 50000;

function calculerAcompte(montantTotalKz, exceptionAcompte = false) {
  const total = Number(montantTotalKz);
  if (!Number.isFinite(total) || total <= 0) {
    const err = new Error("Le montant total du projet doit être supérieur à 0 Kz.");
    err.statusCode = 400;
    err.code = "INVALID_PROJECT_TOTAL";
    throw err;
  }

  if (exceptionAcompte) {
    return Math.min(total, EXCEPTION_ACOMPTE_MAX_KZ);
  }

  return Number((total * 0.5).toFixed(2));
}

function genererNumeroRecuPken() {
  const suffixe = crypto.randomBytes(3).toString("hex").toUpperCase();
  const horodatage = Date.now().toString().slice(-6);
  return `PKEN-${horodatage}-${suffixe}`;
}

async function listerProjets(acteur) {
  const supabase = getSupabaseClient();
  const role = String(acteur.role_code || "").toUpperCase();

  let requete = supabase.from("projets").select("*").order("created_at", { ascending: false });

  if (role === "SUPER_ADMIN") {
  } else if (role === "RESPONSABLE_POLE" || role === "COLLABORATEUR") {
    if (!acteur.pole_id) {
      return [];
    }
    requete = requete.eq("pole_id", acteur.pole_id);
  } else {
    requete = requete.eq("client_id", acteur.id);
  }

  const { data, error } = await requete;
  if (error) {
    const err = new Error("Impossible de récupérer la liste des projets.");
    err.statusCode = 500;
    err.code = "PROJECTS_FETCH_FAILED";
    throw err;
  }

  return data || [];
}

async function creerProjet(acteur, donnees = {}) {
  const role = String(acteur.role_code || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "RESPONSABLE_POLE") {
    const err = new Error("Accès refusé : création de projet réservée au SUPER_ADMIN et RESPONSABLE_POLE.");
    err.statusCode = 403;
    err.code = "FORBIDDEN_ROLE";
    throw err;
  }

  const titre = String(donnees.titre || "").trim();
  const poleId = String(donnees.pole_id || acteur.pole_id || "").trim();
  const montantTotalKz = Number(donnees.montant_total_kz);
  const exceptionAcompte = Boolean(donnees.exception_acompte);
  const motifException = String(donnees.motif_exception || "").trim();
  const clientId = donnees.client_id || null;

  if (!titre || !poleId) {
    const err = new Error("Le titre du projet et le pole_id sont obligatoires.");
    err.statusCode = 400;
    err.code = "MISSING_PROJECT_FIELDS";
    throw err;
  }

  if (role === "RESPONSABLE_POLE" && acteur.pole_id !== poleId) {
    const err = new Error("Accès refusé : vous ne pouvez créer un projet que pour votre propre pôle.");
    err.statusCode = 403;
    err.code = "FORBIDDEN_POLE_SCOPE";
    throw err;
  }

  if (exceptionAcompte && motifException.length < 3) {
    const err = new Error("Un motif d'au moins 3 caractères est obligatoire pour l'exception d'acompte.");
    err.statusCode = 400;
    err.code = "INVALID_EXCEPTION_MOTIF";
    throw err;
  }

  const acompteAttenduKz = calculerAcompte(montantTotalKz, exceptionAcompte);
  const supabase = getSupabaseClient();

  const { data: projetCree, error } = await supabase
    .from("projets")
    .insert({
      titre,
      pole_id: poleId,
      client_id: clientId,
      createur_id: acteur.id,
      montant_total_kz: montantTotalKz,
      acompte_attendu_kz: acompteAttenduKz,
      exception_acompte: exceptionAcompte,
      motif_exception: exceptionAcompte ? motifException : null,
      montant_paye_kz: 0,
      solde_restant_kz: montantTotalKz,
      devise: "Kz",
      statut: "EN_ATTENTE_ACOMPTE"
    })
    .select("*")
    .single();

  if (error || !projetCree) {
    const err = new Error("Impossible de créer le projet.");
    err.statusCode = 500;
    err.code = "PROJECT_CREATION_FAILED";
    throw err;
  }

  return projetCree;
}

async function enregistrerPaiement(acteur, donnees = {}) {
  const projetId = String(donnees.projet_id || "").trim();
  const montantKz = Number(donnees.montant_kz);

  if (!projetId || !Number.isFinite(montantKz) || montantKz <= 0) {
    const err = new Error("Un projet_id valide et un montant_kz supérieur à 0 Kz sont requis.");
    err.statusCode = 400;
    err.code = "INVALID_PAYMENT_DATA";
    throw err;
  }

  const supabase = getSupabaseClient();
  const { data: projet, error: projError } = await supabase
    .from("projets")
    .select("*")
    .eq("id", projetId)
    .maybeSingle();

  if (projError || !projet) {
    const err = new Error("Projet introuvable.");
    err.statusCode = 404;
    err.code = "PROJECT_NOT_FOUND";
    throw err;
  }

  const role = String(acteur.role_code || "").toUpperCase();
  if (role === "RESPONSABLE_POLE" || role === "COLLABORATEUR") {
    if (acteur.pole_id !== projet.pole_id) {
      const err = new Error("Accès refusé : le projet n'appartient pas à votre pôle.");
      err.statusCode = 403;
      err.code = "FORBIDDEN_POLE_SCOPE";
      throw err;
    }
  } else if (role === "CLIENT") {
    if (projet.client_id && projet.client_id !== acteur.id) {
      const err = new Error("Accès refusé : vous ne pouvez pas payer pour un projet d'un autre client.");
      err.statusCode = 403;
      err.code = "FORBIDDEN_PROJECT_ACCESS";
      throw err;
    }
  }

  const numeroRecu = genererNumeroRecuPken();

  const { data: paiementCree, error: payError } = await supabase
    .from("paiements")
    .insert({
      projet_id: projet.id,
      pole_id: projet.pole_id,
      enregistre_par_id: acteur.id,
      montant_kz: montantKz,
      devise: "Kz",
      numero_recu: numeroRecu,
      statut_confirmation: "EN_ATTENTE"
    })
    .select("*")
    .single();

  if (payError || !paiementCree) {
    const err = new Error("Impossible d'enregistrer le paiement.");
    err.statusCode = 500;
    err.code = "PAYMENT_CREATION_FAILED";
    throw err;
  }

  return {
    paiement: paiementCree,
    recu_pken: numeroRecu
  };
}

async function confirmerPaiement(acteur, paiementId) {
  const role = String(acteur.role_code || "").toUpperCase();
  if (role !== "SUPER_ADMIN" && role !== "RESPONSABLE_POLE") {
    const err = new Error("Accès refusé : confirmation réservée au SUPER_ADMIN et RESPONSABLE_POLE.");
    err.statusCode = 403;
    err.code = "FORBIDDEN_ROLE";
    throw err;
  }

  const idNormalise = String(paiementId || "").trim();
  if (!idNormalise) {
    const err = new Error("Identifiant de paiement manquant.");
    err.statusCode = 400;
    err.code = "MISSING_PAYMENT_ID";
    throw err;
  }

  const supabase = getSupabaseClient();

  const { data: existingPayment, error: payError } = await supabase
    .from("paiements")
    .select("*")
    .eq("id", idNormalise)
    .maybeSingle();

  if (payError || !existingPayment) {
    const err = new Error("Paiement introuvable.");
    err.statusCode = 404;
    err.code = "PAYMENT_NOT_FOUND";
    throw err;
  }

  if (role === "RESPONSABLE_POLE" && acteur.pole_id !== existingPayment.pole_id) {
    const err = new Error("Accès refusé : vous ne pouvez pas confirmer un paiement d'un autre pôle.");
    err.statusCode = 403;
    err.code = "FORBIDDEN_POLE_SCOPE";
    throw err;
  }

  const { data: projet, error: projError } = await supabase
    .from("projets")
    .select("*")
    .eq("id", existingPayment.projet_id)
    .maybeSingle();

  if (projError || !projet) {
    const err = new Error("Projet associé introuvable.");
    err.statusCode = 404;
    err.code = "PROJECT_NOT_FOUND";
    throw err;
  }

  // CORRECTION BUG DOUBLE CONFIRMATION : si déjà confirmé, on ne rajoute RIEN
  if (existingPayment.statut_confirmation === "CONFIRME") {
    return {
      paiement_id: existingPayment.id,
      statut_confirmation: "CONFIRME",
      numero_recu: existingPayment.numero_recu,
      projet: projet
    };
  }

  const { error: updatePayError } = await supabase
    .from("paiements")
    .update({
      statut_confirmation: "CONFIRME",
      confirme_par_id: acteur.id,
      confirme_le: new Date().toISOString()
    })
    .eq("id", existingPayment.id);

  if (updatePayError) {
    const err = new Error("Impossible de confirmer le paiement.");
    err.statusCode = 500;
    err.code = "PAYMENT_CONFIRM_FAILED";
    throw err;
  }

  const nouveauMontantPaye = Number(projet.montant_paye_kz || 0) + Number(existingPayment.montant_kz || 0);
  const totalProjet = Number(projet.montant_total_kz || 0);
  const acompteAttendu = Number(projet.acompte_attendu_kz || 0);
  const nouveauSoldeRestant = Math.max(0, Number((totalProjet - nouveauMontantPaye).toFixed(2)));

  let statutCalcule = "EN_ATTENTE_ACOMPTE";
  if (nouveauSoldeRestant <= 0) {
    statutCalcule = "SOLDE";
  } else if (nouveauMontantPaye >= acompteAttendu) {
    statutCalcule = "EN_COURS";
  }

  const statutFinal = STATUTS_VALIDES.has(statutCalcule) ? statutCalcule : "EN_ATTENTE_ACOMPTE";

  const { data: projetMisAJour, error: updateProjError } = await supabase
    .from("projets")
    .update({
      montant_paye_kz: nouveauMontantPaye,
      solde_restant_kz: nouveauSoldeRestant,
      statut: statutFinal
    })
    .eq("id", projet.id)
    .select("*")
    .single();

  if (updateProjError) {
    const err = new Error("Impossible de mettre à jour le statut du projet.");
    err.statusCode = 500;
    err.code = "PROJECT_UPDATE_FAILED";
    throw err;
  }

  return {
    paiement_id: existingPayment.id,
    statut_confirmation: "CONFIRME",
    numero_recu: existingPayment.numero_recu,
    projet: projetMisAJour
  };
}

module.exports = {
  calculerAcompte,
  genererNumeroRecuPken,
  listerProjets,
  creerProjet,
  enregistrerPaiement,
  confirmerPaiement
};
