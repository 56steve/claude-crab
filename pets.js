"use strict";

// Pet packs. Each folder under pets/ is a self-contained pet:
//   pets/<id>/pet.json  metadata (id, name, author, stages)
//   pets/<id>/pet.html  a <style> block plus the <svg> artwork
// Adding a pet means dropping in a folder. Nothing else needs editing.

const fs = require("fs");
const path = require("path");

const PETS_DIR = path.join(__dirname, "pets");

/** List every valid pet pack, crab first, then alphabetical by name. */
function listPets() {
  let entries;
  try {
    entries = fs.readdirSync(PETS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const pets = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const meta = JSON.parse(
        fs.readFileSync(path.join(PETS_DIR, entry.name, "pet.json"), "utf8")
      );
      if (meta && meta.id && Array.isArray(meta.stages) && meta.stages.length) {
        pets.push({
          id: meta.id,
          name: meta.name || meta.id,
          author: meta.author || "",
          stages: meta.stages,
        });
      }
    } catch {
      // skip a malformed pack rather than crashing
    }
  }
  pets.sort((a, b) => {
    if (a.id === "crab") return -1;
    if (b.id === "crab") return 1;
    return a.name.localeCompare(b.name);
  });
  return pets;
}

/** Load one pet by id (with its artwork), falling back to the crab. */
function loadPet(id) {
  const pets = listPets();
  const meta =
    pets.find((p) => p.id === id) ||
    pets.find((p) => p.id === "crab") ||
    pets[0];
  if (!meta) return null;
  let html;
  try {
    html = fs.readFileSync(path.join(PETS_DIR, meta.id, "pet.html"), "utf8");
  } catch {
    return null;
  }
  return { ...meta, html };
}

module.exports = { listPets, loadPet, PETS_DIR };
