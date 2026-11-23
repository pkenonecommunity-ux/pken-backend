const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const err = new Error("Configuration serveur incomplète : JWT_SECRET manquant.");
    err.statusCode = 500;
    err.code = "MISSING_JWT_SECRET";
    throw err;
  }
  return secret;
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    const err = new Error("Configuration serveur incomplète : variables SUPABASE manquantes.");
    err.statusCode = 500;
    err.code = "MISSING_SUPABASE_CONFIG";
    throw err;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function signerToken(utilisateur) {
  const payload = {
    sub: utilisateur.id,
    id: utilisateur.id,
    role_code: String(utilisateur.role_code || "CLIENT").toUpperCase(),
    pole_id: utilisateur.pole_id || null,
    nom: utilisateur.nom || null,
    email: utilisateur.email || null
  };
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "24h"
  });
}

async function inscrireClient(donnees = {}) {
  const nom = String(donnees.nom || "").trim();
  const email = String(donnees.email || "").trim().toLowerCase();
  const motDePasse = String(donnees.mot_de_passe || "");
  if (nom.length < 2 || !email.includes("@") || motDePasse.length < 6) {
    const err = new Error("Nom (min. 2 caractères), email valide et mot de passe (min. 6 caractères) sont requis.");
    err.statusCode = 400;
    err.code = "INVALID_REGISTRATION_DATA";
    throw err;
  }
  const supabase = getSupabaseClient();
  const { data: existant, error: lookupError } = await supabase
    .from("utilisateurs")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (lookupError) {
    const err = new Error("Erreur lors de la vérification de l'adresse email.");
    err.statusCode = 500;
    err.code = "DB_LOOKUP_ERROR";
    throw err;
  }
  if (existant) {
    const err = new Error("Un compte existe déjà avec cet email.");
    err.statusCode = 409;
    err.code = "EMAIL_ALREADY_EXISTS";
    throw err;
  }
  const motDePasseHash = await bcrypt.hash(motDePasse, 10);
  const { data: cree, error: insertError } = await supabase
    .from("utilisateurs")
    .insert({
      nom,
      email,
      mot_de_passe_hash: motDePasseHash,
      role_code: "CLIENT",
      pole_id: null
    })
    .select("id, nom, email, role_code, pole_id")
    .single();
  if (insertError || !cree) {
    const err = new Error("Impossible de créer le compte utilisateur.");
    err.statusCode = 500;
    err.code = "USER_CREATION_FAILED";
    throw err;
  }
  const token = signerToken(cree);
  return {
    token,
    utilisateur: {
      id: cree.id,
      nom: cree.nom,
      email: cree.email,
      role_code: cree.role_code,
      pole_id: cree.pole_id
    }
  };
}

async function connecterUtilisateur(donnees = {}) {
  const email = String(donnees.email || "").trim().toLowerCase();
  const motDePasse = String(donnees.mot_de_passe || "");
  if (!email || !motDePasse) {
    const err = new Error("L'email et le mot de passe sont obligatoires.");
    err.statusCode = 400;
    err.code = "MISSING_CREDENTIALS";
    throw err;
  }
  const supabase = getSupabaseClient();
  const { data: utilisateur, error } = await supabase
    .from("utilisateurs")
    .select("id, nom, email, role_code, pole_id, mot_de_passe_hash")
    .eq("email", email)
    .maybeSingle();
  if (error || !utilisateur || !utilisateur.mot_de_passe_hash) {
    const err = new Error("Identifiants invalides.");
    err.statusCode = 401;
    err.code = "INVALID_CREDENTIALS";
    throw err;
  }
  const valide = await bcrypt.compare(motDePasse, utilisateur.mot_de_passe_hash);
  if (!valide) {
    const err = new Error("Identifiants invalides.");
    err.statusCode = 401;
    err.code = "INVALID_CREDENTIALS";
    throw err;
  }
  const token = signerToken(utilisateur);
  return {
    token,
    utilisateur: {
      id: utilisateur.id,
      nom: utilisateur.nom,
      email: utilisateur.email,
      role_code: String(utilisateur.role_code || "CLIENT").toUpperCase(),
      pole_id: utilisateur.pole_id || null
    }
  };
}

module.exports = {
  getJwtSecret,
  getSupabaseClient,
  signerToken,
  inscrireClient,
  connecterUtilisateur
};
