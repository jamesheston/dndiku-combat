const dndlib = require('../../dndiku-lib/lib/dndlib')
const fighterlib = require('../../dndiku-classes/lib/fighterlib')
const combatlib = require('./combatlib')
const Damage = require('../../../src/Damage')
const Logger = require('../../../src/Logger')
const RandomUtil = require('../../../src/RandomUtil')
const CombatErrors = require('./CombatErrors')
const Parser = require('../../../src/CommandParser').CommandParser


/**
 * This class is an example implementation of a Diku-style real time combat system. Combatants
 * attack and then have some amount of lag applied to them based on their weapon speed and repeat.
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
      Combat.handleDeath(state, attacker)
      return false
    }

    if (!attacker.isInCombat()) {
      if (!attacker.isNpc) {
        attacker.removePrompt('combat')
      }
      return false
    }

    let lastRoundStarted = attacker.combatData.roundStarted
    attacker.combatData.roundStarted = Date.now()

    // cancel if the attacker's combat lag hasn't expired yet
    if (attacker.combatData.lag > 0) {
      const elapsed = Date.now() - lastRoundStarted
      attacker.combatData.lag -= elapsed
      return false
    }

    // currently just grabs the first combatant from their list but could easily be modified to
    // implement a threat table and grab the attacker with the highest threat
    let target = null
    try {
      target = Combat.chooseCombatant(attacker)
    } catch (e) {
      attacker.removeFromCombat()
      attacker.combatData = {}
      throw e
    }

    // no targets left, remove attacker from combat
    if (!target) {
      attacker.removeFromCombat()
      // reset combat data to remove any lag
      attacker.combatData = {}
      return false
    }

    Combat.makeAttacks(attacker, target)
    return true
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
   * First, get subattacks array from attacker to be applied to target
   * Then roll to hit for each attack
   * Then apply damage for each attack
   * @param {Character} attacker
   * @param {Character} target
   */
  static makeAttacks(attacker, target) {
    let combatAttacks = []

    if( attacker.isNpc ) {
      combatAttacks = attacker.behaviors.get('combatAttacks')

    } else { // if player
      // combatAttacks = combatlib.getCombatAttacks(attacker)
      combatAttacks = fighterlib.getCombatAttacks(attacker)
    }
    // split each attack into subattacks based on attacks[n].attacksPerRound prop
    let subAttacks = combatlib.getSubAttacks(combatAttacks)
    var totalDamage = 0

    // for every sub attack, roll to hit. if it hits, add damage to total
    for (var i = 0; i < subAttacks.length; i++) {
      var subA = subAttacks[i]
      let subADoesHit = combatlib.rollToHit(attacker, target, subA)
      if( subADoesHit ) {
        subA['misses'] = false
        subA['rolledDamage'] = dndlib.rollDice(subA.damageDiceSum) // we're passing it a string like '1d8+3'
        totalDamage+= subA['rolledDamage']
      } else {
        subA['misses'] = true
        subA['rolledDamage'] = 0
      }
    }

    // after all sub attacks have been rolled and we have total damage, apply the damage to target
    // also, note there is a 'hit' event and a 'damaged' event, both print combat attack attempts
    const damage = new Damage({ 
      attacker: attacker,
      attribute: 'health', 
      amount: totalDamage,
      attacks: subAttacks,
      targetInitialHp: target.getAttribute('health'),
    });
    damage.commit(target);

    if (target.getAttribute('health') <= 0) {
      target.combatData.killedBy = attacker;
    }

    const standardAttackLag = 5 // seconds 
    attacker.combatData.lag += standardAttackLag * 1000
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
      throw new CombatErrors.CombatSelfError("You smack yourself in the face. Ouch!");
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
