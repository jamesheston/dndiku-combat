function combatlib() {}
module.exports = combatlib

const dndlib = require('../../dndiku-lib/lib/dndlib')
const fighterlib = require('../../dndiku-classes/lib/fighterlib')
const thieflib = require('../../dndiku-classes/lib/thieflib')
const wizardlib = require('../../dndiku-classes/lib/wizardlib')
const clericlib = require('../../dndiku-classes/lib/clericlib')

combatlib.getPlayerCombatAttacks = function(player) {
  let combatAttacks
  let _class = player.getMeta('class')
  // NOTE! atm, I am going to keep .getCombatAttacks specific to each player class.
  // However, fighters are the only class currently that get multiple attacks per round.
  // But there are specific ability modifiers for thieves and wizards, like weapon
  // proficiency, which are involved in getCombatAttacks().
  if( _class === 'fighter' ) {
    combatAttacks = fighterlib.getCombatAttacks(player)
  
  } else if (_class === 'thief') {
    combatAttacks = thieflib.getCombatAttacks(player)
  
  } else if (_class === 'wizard') {
    combatAttacks = wizardlib.getCombatAttacks(player)

  } else if (_class === 'cleric') {
    combatAttacks = clericlib.getCombatAttacks(player)
  }  

  return combatAttacks
}

combatlib.getMonsterCombatAttacks = function(npc) {
  return npc.behaviors.get('combatAttacks')  
}

combatlib.getCombatAttacks = function(entity) {
  let combatAttacks

  if( entity.isNpc ) {
    combatAttacks = combatlib.getMonsterCombatAttacks(entity)
  } else { // if player
    combatAttacks = combatlib.getPlayerCombatAttacks(entity)
  }
  return combatAttacks
}

combatlib.getSubAttacks = function(combatAttacks) {
  let subAttacks = []

  for (var i = 0; i < combatAttacks.length; i++) {
    var cAttack = combatAttacks[i]
    var attacksThisRound = Math.floor(cAttack.attacksPerRound)

    // if there's a decimal remainder, it represents the % chance of 
    // another attack this round. so lets roll to see if we add 1 more attack 
    if( cAttack.attacksPerRound % 1 !== 0 ) {
      var remainder = cAttack.attacksPerRound % 1
      // if the remainder is 0.25, there is a 25%, or 1/4 chance...
      // so if random number between 0-99 is < 25, than there is another attack
      if( Math.random() < remainder ) {
        attacksThisRound++
      }
    }
    // subAttack object is same as combatAttack except w/o attacksPerRound prop
    for (var j = 0; j < attacksThisRound; j++) {
      var copy = {...cAttack}
      delete copy.attacksPerRound
      subAttacks.push(copy)
    }
  }

  return subAttacks
}

combatlib.rollToHit = function(attacker, target, attack) {
  let attackDoesHit = false
  let rollResult = dndlib.rollDice(1, 20)
  // roll of 1 always misses, regardless of stats
  if( rollResult === 1 ) { 
    attackDoesHit = false
    return attackDoesHit
  // roll of 20 always hits, regardless of stats
  } else if (rollResult === 20) { 
    attackDoesHit = true
    return attackDoesHit
  }
  // else...
  // If dice result wasnt 1 or 2, we need to compare integer # rolled
  // to a minNum needed to hit. This is based on attacker and target character
  // stats.
  
  // 1. Get Attacker's THAC0
  const attackThac0 = attack.thac0Sum
  // 2. Get Target's AC
  // const targetAc = target.getCurrentAc()
  const targetAc = combatlib.getAc(target)
  // 3. Compare minNumToHit vs numRolled to see if attack hits
  const minRollToHit = attackThac0 - targetAc
  if( rollResult >= minRollToHit ) {
    attackDoesHit = true
  }
  return attackDoesHit
}

combatlib.getAc = function(entity) {

  let ac
  if (entity.isNpc) {
    ac = combatlib.getMonsterAc(entity)
  } else {
    ac = combatlib.getPlayerAc(entity)
  }
  return ac
}

combatlib.getPlayerAc = function(player) {
  let ac = 10

  let baseAc = 10 // starting AC value without eq or ability mods is 10
  let armorAcMod = 0
  let shieldAcMod = 0
  let helmetAcMod = 0
  let dexAcMod = 0

  let armor = player.equipment.get('body')
  if( armor && armor.metadata.ac ) {
    armorAcMod+= armor.metadata.ac
  }  

  let shield = player.equipment.get('shield')
  if( shield && shield.metadata.ac ) {
    shieldAcMod = shield.metadata.ac
  }

  // let helmet = player.equipment.get('head')
  // if( helmet && helmet.metadata.ac ) {
  //   helmetAcMod = helmet.metadata.ac
  // }  
  // dexAcMod is already inverted, so we need to add it
  dexAcMod = dndlib.getDexAcModifier(player.getAttribute('dex'))

  ac = 10 - armorAcMod - shieldAcMod + dexAcMod 
  return ac
}

combatlib.getMonsterAc = function(npc) {
  // atm, for npcs, ac is just a plain integer value which is stored as an attribute.
  // it is originally pulled from thac0 value specified in area's npcs.yml file
  let ac = 10
  if( npc.hasAttribute('ac') ) {
    ac = npc.getAttribute('ac')
  }
  return ac
}

combatlib.getUnarmedWeapon = function() {
  return {
    name: 'unarmed',
    metadata: {
      damageDice: '1d1',
      magicalModifier: 0,
      verb: 'punch',
      range: 0,
    }      
  }
}

combatlib.getWeaponProficiencyDamageModifier = function(proficiencyLevel) {
  /*
  In complete AD&D rules, if you use a weapon have spent 0 proficiency points
  on (not proficient), you get a -2 penalty to hit. If you have 1 prof point in that 
  weapon type, you get no bonus or penalty. If you're a warrior, you can spend 2
  points to *focus* in a weapon, and get +1 to-hit rolls, and +2 to damage rolls

  For now, in our combat system, the only way weapn proficiencies and specialization
  are implemented is that warriors get +1 to-hit rolls and +2 to damage rolls when 
  wielding a weapon/not unarmed (that
  is, I assume warriors are specialists in whatever weapon they are wielding. And I
  assume all other classes are at least proficient in whatever weapon they are 
  wielding).
  */  
  const profDamageTable = {
    0: 0,
    1: 0,
    2: 2,
  }
  return profDamageTable[proficiencyLevel]
}

combatlib.getWeaponProficiencyToHitModifier = function(proficiencyLevel) {
  /*
  In complete AD&D rules, if you use a weapon have spent 0 proficiency points
  on (not proficient), you get a -2 penalty to hit. If you have 1 prof point in that 
  weapon type, you get no bonus or penalty. If you're a warrior, you can spend 2
  points to *focus* in a weapon, and get +1 to-hit rolls, and +2 to damage rolls

  For now, in our combat system, the only way weapn proficiencies and specialization
  are implemented is that warriors get +1 to-hit rolls and +2 to damage rolls when 
  wielding a weapon/not unarmed (that
  is, I assume warriors are specialists in whatever weapon they are wielding. And I
  assume all other classes are at least proficient in whatever weapon they are 
  wielding).
  */
  const profToHitTable = {
    0: 0,
    1: 0,
    2: 1,
  } 
  return profToHitTable[proficiencyLevel]   
}

