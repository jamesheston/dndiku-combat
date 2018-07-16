const Dice = require('../../dndiku-lib/lib/Dice')
const Damage = require('../../../src/Damage')
const Logger = require('../../../src/Logger')
const RandomUtil = require('../../../src/RandomUtil')
const CombatErrors = require('./CombatErrors')
const Parser = require('../../../src/CommandParser').CommandParser
const charlib = require('../../dndiku-classes/lib/charlib')

/**
 * This class is an example implementation of a Diku-style real time combat system. Combatants
 * attack and then have some amount of lag applied to them 
 */
class Combat {

  /**
   * Handle a single combat round for a given attacker
   * @param {GameState} state
   * @param {Character} attacker
   * @return {boolean}  true if combat actions were performed this round
   */
  static updateRound(state, attacker) {
    if (attacker.getAttribute('health') <= 0) {
      Combat.handleDeath(state, attacker);
      return false;
    }

    if (!attacker.isInCombat()) {
      if (!attacker.isNpc) {
        attacker.removePrompt('combat');
      }
      return false;
    }

    let lastRoundStarted = attacker.combatData.roundStarted;
    attacker.combatData.roundStarted = Date.now();

    // cancel if the attacker's combat lag hasn't expired yet
    if (attacker.combatData.lag > 0) {
      const elapsed = Date.now() - lastRoundStarted;
      attacker.combatData.lag -= elapsed;
      return false;
    }

    // currently just grabs the first combatant from their list but could easily be modified to
    // implement a threat table and grab the attacker with the highest threat
    let target = null;
    try {
      target = Combat.chooseCombatant(attacker);
    } catch (e) {
      attacker.removeFromCombat();
      attacker.combatData = {};
      throw e;
    }

    // no targets left, remove attacker from combat
    if (!target) {
      attacker.removeFromCombat();
      // reset combat data to remove any lag
      attacker.combatData = {};
      return false;
    }

    Combat.autoAttack(attacker, target);
    return true;
  }


  /**
   * Find a target for a given attacker
   * @param {Character} attacker
   * @return {Character|null}
   */
  static chooseCombatant(attacker) {
    if (!attacker.combatants.size) {
      return null;
    }

    for (const target of attacker.combatants) {
      if (!target.hasAttribute('health')) {
        throw new CombatErrors.CombatInvalidTargetError();
      }
      if (target.getAttribute('health') > 0) {
        return target;
      }
    }

    return null;
  }


  /**
   * Run the auto attacks for a single char this round of combat.
   * Side effects include echoing those attack attempts.
   * Potentially apply some damage from an attacker to a target.
   * @param {Character} attacker
   * @param {Character} target
   */
  static autoAttack(attacker, target) {
    let autoAttacks

    if( attacker.isNpc) {
      autoAttacks = (  attacker.getMeta('autoAttacks')  ) ? attacker.getMeta('autoAttacks') : charlib.getFallbackNpcAutoAttacks(attacker) // maybe add default attack for false based on NPC level
    } else {
       autoAttacks = attacker.playerClass.getAutoAttacks(attacker)
    }      

    // Split `autoAttacks`, which is an array of attack types,
    // into `subAttacks`, which is an array of each attack
    // that needs to be rolled this round.
    const subAttacks = this.splitAttacks(autoAttacks)

    let totalDamage = 0
    // For every sub attack, roll to hit.
    // If sub attack hits, add damage to total.
    // for (let [i, subA] of subAttacks) {
    for ( var i = 0; i < subAttacks.length; i++ ) {
      const subA = subAttacks[i]

      const subADoesHit = this.rollToHit(attacker, target, subA)
      if( subADoesHit ) {
        subA['didMiss'] = false
        subA['rolledDamage'] = Dice.roll(subA.damageDiceSum)
        totalDamage+= subA['rolledDamage']
      } else {
        subA['didMiss'] = true
        subA['rolledDamage'] = 0
      }
    }

    // After all sub attacks have been rolled and we have attached
    // the resulting data (didMiss, rolledDamage) back onto each sub attack object.
    // We then attach all these subattack objects to a new Damage 
    // object. When the damage is commited to the target, all the
    // attack rolls are echoed in the combat/player-events.js
    // script.
    const damage = new Damage({
      attacker: attacker,
      attribute: 'health',
      amount: totalDamage,
    })
    // NOTE: damage.attacks & damage.targetInitialHp are being attached here b/c
    // Damage object doesn't accept arbitrary/custom props

    damage.attacks = subAttacks // do I need to fallback to `null` value?
    // target's health before round started is passed
    // in to echo an appropriate description of 
    // damage sustained from each sub attack
    damage.targetInitialHp = (  target.getAttribute('health')  ) ? target.getAttribute('health') : 9999  // b/c 0 would blow math up, right?

    damage.commit(target)

    if( target.getAttribute('health') <= 0 ) {
      target.combatData.killedBy = attacker
    }

    const standardAttackLag = 5 // seconds
    attacker.combatData.lag += standardAttackLag * 1000
  }

  static rollToHit(attacker, target, attack) {
    let attackDoesHit = false

    let rollResult = Dice.roll('1d20')
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
    let targetAc
    if( target.isNpc ) {
      targetAc = (target.attributes.ac) ? target.attributes.ac : 10 // if npc has no attrbutes.ac set, default to 10
    } else { // target is player
      targetAc = target.playerClass.getAc(target)
    }


    // 3. Compare minNumToHit vs numRolled to see if attack hits
    const minRollToHit = attackThac0 - targetAc
    if( rollResult >= minRollToHit ) {
      attackDoesHit = true
    }
    
    return attackDoesHit    
  }


  static splitAttacks(autoAttacks) {
    let subAttacks = []

    for (var i = 0; i < autoAttacks.length; i++) {
      var aAttack = autoAttacks[i]
      var attacksThisRound = Math.floor(aAttack.attacksPerRound)

      // if there's a decimal remainder, it represents the % chance of 
      // another attack this round. so lets roll to see if we add 1 more attack 
      if( aAttack.attacksPerRound % 1 !== 0 ) {
        var remainder = aAttack.attacksPerRound % 1
        // if the remainder is 0.25, there is a 25%, or 1/4 chance...
        // so if random number between 0-99 is < 25, than there is another attack
        if( Math.random() < remainder ) {
          attacksThisRound++
        }
      }
      // subAttack object is same as combatAttack except w/o attacksPerRound prop
      for (var j = 0; j < attacksThisRound; j++) {
        var copy = {...aAttack}
        delete copy.attacksPerRound
        subAttacks.push(copy)
      }
    }

    return subAttacks
  }


  /**
   * Any cleanup that has to be done if the character is killed
   * @param {Character} deadEntity
   * @param {?Character} killer Optionally the character that killed the dead entity
   */
  static handleDeath(state, deadEntity, killer) {
    deadEntity.removeFromCombat();

    killer = killer || deadEntity.combatData.killedBy;
    Logger.log(`${killer ? killer.name : 'Something'} killed ${deadEntity.name}.`);


    if (killer) {
      killer.emit('deathblow', deadEntity);
    }
    deadEntity.emit('killed', killer);

    if (deadEntity.isNpc) {
      state.MobManager.removeMob(deadEntity);
      deadEntity.room.area.removeNpc(deadEntity);
    }
  }


  static startRegeneration(state, entity) {
    if (entity.hasEffectType('regen')) {
      return;
    }

    let regenEffect = state.EffectFactory.create('regen', entity, { hidden: true }, { magnitude: 15 });
    if (entity.addEffect(regenEffect)) {
      regenEffect.activate();
    }
  }


  /**
   * @param {string} args
   * @param {Player} player
   * @return {Entity|null} Found entity... or not.
   */
  static findCombatant(attacker, search) {
    if (!search.length) {
      return null;
    }

    let possibleTargets = [...attacker.room.npcs];
    if (attacker.getMeta('pvp')) {
      possibleTargets = [...possibleTargets, ...attacker.room.players];
    }

    const target = Parser.parseDot(search, possibleTargets);

    if (!target) {
      return null;
    }

    if (target === attacker) {
      throw new CombatErrors.CombatSelfError("Stop hitting yourself.")
    }

    if (!target.hasAttribute('health')) {
      throw new CombatErrors.CombatInvalidTargetError("You can't attack that target");
    }

    if (!target.isNpc && !target.getMeta('pvp')) {
      throw new CombatErrors.CombatNonPvpError(`${target.name} has not opted into PvP.`, target);
    }

    if (target.pacifist) {
      throw new CombatErrors.CombatPacifistError(`${target.name} is a pacifist and will not fight you.`, target);
    }

    return target;
  }

}


module.exports = Combat;
