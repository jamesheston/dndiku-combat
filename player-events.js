const Combat = require('./lib/Combat')
const CombatErrors = require('./lib/CombatErrors')
// const LevelUtil = require('../dndiku-classes/lib/LevelUtil')
// const WebsocketStream = require('../ranvier-websocket/lib/WebsocketStream')


/**
 * Auto combat module
 */
module.exports = (srcPath) => {
  const B = require(srcPath + 'Broadcast');

  return  {
    listeners: {
      updateTick: state => function () {
        Combat.startRegeneration(state, this);

        let hadActions = false;
        try {
          hadActions = Combat.updateRound(state, this);
        } catch (e) {
          if (e instanceof CombatErrors.CombatInvalidTargetError) {
            B.sayAt(this, "You can't attack that target.");
          } else {
            throw e;
          }
        }

        if (!hadActions) {
          return;
        }
      },

      /**
       * When a player makes combat attacks
       * @param {Damage} damage
       * @param {Character} target
       */
      hit: state => function (damage, target) {
        if (damage.hidden) {
          return
        }

        var attacks = damage.attacks

        // currently, this should occur for spells that get cast because when they 
        // commit damage, it gets passed to `hit` and `damaged` events in this file
        if(! attacks ) { 
          return
        }

        // Build attacks message for attacking player
        let output1 = ''
        for (var i = 0; i < attacks.length; i++) {
          var attack = attacks[i]
          var line = getAttackLine(attack, this.name, damage, target.name, 'attacker')
          output1+= line
        }
        output1 = adjustNewlinesMargin(output1)

        // Build attacks message for target player
        let output2 = ''
        for (var i = 0; i < attacks.length; i++) {
          var attack = attacks[i]
          var line = getAttackLine(attack, this.name, damage, target.name, 'target')
          output2+= line
        }
        output2 = adjustNewlinesMargin(output2)

        // Build attacks message for 3rd parties in room
        let output3 = ''
        for (var i = 0; i < attacks.length; i++) {
          var attack = attacks[i]
          var line = getAttackLine(attack, this.name, damage, target.name, 'other')
          output3+= line
        }

        B.sayAt(this, output1) // broadcast attack to attacker
        B.sayAt(target, output2) // broadcast attack to target
        B.sayAtExcept( this.room, output3, // broadcast attack to everyone else in room
          [this, target]  
        )

        // Show prompts too
        B.prompt(this)
        if(! target.isNpc ) {
          B.prompt(target)
        }
      },

      /*
      Misnomer atm, as this fires
      when a player is attacked by a mob, including misses.
      */
      damaged: state => function (damage) {
        if (damage.hidden || damage.attribute !== 'health') {
          return;
        }
        // if attacker is a player, exit. 'damaged' only emits messages for 
        // attacks made by npcs
        if( damage.attacker && !damage.attacker.isNpc ) {
          return
        }

        if (this.getAttribute('health') <= 0 && damage.attacker) {
          this.combatData.killedBy = damage.attacker;
        }

        var attacks = damage.attacks

        // currently, this should occur for spells that get cast because when they 
        // commit damage, it gets passed to `hit` and `damaged` events in this file
        if(! attacks ) { 
          return
        }

        // Echo combat attacks to player target
        let output1 = ''
        for (var i = 0; i < attacks.length; i++) {
          var attack = attacks[i]
          var line = getAttackLine(attack, damage.attacker.name, damage, this.name, 'target')
          output1+= line
        }
        output1 = adjustNewlinesMargin(output1)

        // Echo combat attacks to other players in room
        let output2 = ''
        for (var i = 0; i < attacks.length; i++) {
          var attack = attacks[i]
          var line = getAttackLine(attack, damage.attacker.name, damage, this.name, 'other')
          output2+= line
        }

        B.sayAt(this, output1)
        B.sayAtExcept(this.room, output2, this)

        if(! this.isNpc ) {
          B.prompt(this)
        }

      },


      /**
       * @param {Heal} heal
       * @param {Character} target
       */
      heal: state => function (heal, target) {
        // if (heal.hidden) {
        //   return;
        // }

        // if (target !== this) {
        //   let buf = '';
        //   if (heal.source) {
        //     buf = `Your ${heal.source.name} healed`;
        //   } else {
        //     buf = "You heal";
        //   }

        //   buf += ` ${target.name} for ${heal.finalAmount} ${heal.attribute}.`;
        //   B.sayAt(this, buf);
        // }

        // // show heals to party members
        // if (!this.party) {
        //   return;
        // }

        // for (const member of this.party) {
        //   if (member === this || member.room !== this.room) {
        //     continue;
        //   }

        //   let buf = '';
        //   if (heal.source) {
        //     buf = `${this.name} ${heal.source.name} healed`;
        //   } else {
        //     buf = `${this.name} healed`;
        //   }

        //   buf += ` ${target.name}`;
        //   buf += ` for ${heal.finalAmount} ${heal.attribute}.`;
        //   B.sayAt(member, buf);
        // }
      },

      healed: state => function (heal) {
        // if (heal.hidden) {
        //   return;
        // }

        // let buf = '';
        // let attacker = '';
        // let source = '';

        // if (heal.attacker && heal.attacker !== this) {
        //   attacker = `${heal.attacker.name} `;
        // }

        // if (heal.source) {
        //   attacker = attacker ? attacker + "'s " : '';
        //   source = `${heal.source.name}`;
        // } else if (!heal.attacker) {
        //   source = "Something"
        // }

        // if (heal.attribute === 'health') {
        //   buf = `${attacker}${source} heals you for ${heal.finalAmount}.`;
        // } else {
        //   buf = `${attacker}${source} restores ${heal.finalAmount} ${heal.attribute}.`;
        // }
        // B.sayAt(this, buf);

        // // show heal to party members only if it's to health and not restoring a different pool
        // if (!this.party || heal.attribute !== 'health') {
        //   return;
        // }

        // for (const member of this.party) {
        //   if (member === this || member.room !== this.room) {
        //     continue;
        //   }

        //   let buf = `${attacker}${source} heals ${this.name} for ${heal.finalamount}.`;
        //   B.sayAt(member, buf);
        // }
      },

      currency: state => function (currency, amount) {
        // const friendlyName = currency.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
        // const key = `currencies.${currency}`;

        // if (!this.getMeta('currencies')) {
        //   this.setMeta('currencies', {});
        // }
        // this.setMeta(key, (this.getMeta(key) || 0) + amount);
        // this.save();

        // B.sayAt(this, `<green>You receive currency: <b><white>[${friendlyName}]</white></b> x${amount}.`);
      },

      /**
       * Player was killed
       * @param {Character} killer
       */
      killed: state => function (killer) {
        this.removePrompt('combat')

        const othersDeathMessage = killer ?
          `${this.name} collapses to the ground, killed by ${killer.name}.` :
          `${this.name} collapses to the ground, dead.`

        B.sayAtExcept(this.room, othersDeathMessage, (killer ? [killer, this] : this))

        if (this.party) {
          B.sayAt(this.party, `${this.name} was killed!`)
        }

        this.setAttributeToMax('health')

        let home = state.RoomManager.getRoom(this.getMeta('waypoint.home'))
        if (!home) {
          home = state.RoomManager.startingRoom
        }

        this.moveTo(home, _ => {

          B.sayAt(this, '<red>You have died!</red>')
          if (killer && killer !== this) {
            B.sayAt(this, `You were killed by ${killer.name}.\n`)
          }
          state.CommandManager.get('look').execute(null, this)
          // B.prompt(this)
          // player loses 20% exp gained this level on death
          // const lostExp = Math.floor(this.experience * 0.2)
          // this.experience -= lostExp
          this.save()
          // B.sayAt(this, `<red>You lose ${lostExp} experience!`)

        })
      },

      /**
       * Player killed a target
       * @param {Character} target
       */
      deathblow: state => function (target, skipParty) {
        const xp = target.getMeta('xp') || 0
        const multiplier = 100

        if (this.party && !skipParty) {
          // if they're in a party proxy the deathblow to all members of the party in the same room.
          // this will make sure party members get quest credit trigger anything else listening for deathblow
          for (const member of this.party) {
            if (member.room === this.room) {
              member.emit('deathblow', target, true)
            }
          }
          return
        }

        if (target && !this.isNpc) {
          B.sayAt(this, `\nYou killed ${target.name}!`)
        }

        this.emit('experience', xp * multiplier)
      }
    }
  }

  function adjustNewlinesMargin(input) {
    let output = input
    // remove last newline
    // const li = output.lastIndexOf('\n')
    // output = output.slice(0, li-1)
    output = output.replace(/\n$/g, "")
    // add newline above/at beginning
    output = '\n' + output
    return output
  }  

  function getDamageAdjective(targetInitialHp, damageDealt) {
    let adjective = ''
    const amountAdjectives = {
      0.01: 'no apparent',  // < 1%
      0.05: 'little',       // < 5%
      0.15: 'some',         // < 15%
      0.25: 'considerable', // < 25%
      0.5: 'great',        // < 50%
      // <- DONT PUT A 1 AS KEY HERE! IT BREAKS ITERATION ORDER!
    }
    const dealtDamageRatio = damageDealt / targetInitialHp
    for (const r in amountAdjectives) {
      var ratio = parseFloat(r)
      adjective = amountAdjectives[r]
      if( dealtDamageRatio < ratio ) {
        break
      }
    }
    return adjective  
  }

  /*
  Try and replace this with a set of grammatical rules 
  */
  function conjugateVerb(verb) {
    let table = {
      'slash': 'slashes',
      'bite': 'bites',
      'claw': 'claws',
      'punch': 'punches',
      'peck': 'pecks',
      'hit': 'hits',
      'club': 'clubs',
      'stab': 'stabs',
      'crush': 'crushes',
    }
    return table[verb]
  }

  function getAttackLine(attack, attackerName, damage, targetName, viewer) {
    let output = ''
    /*
    if viewer = 'attacker'
    You punch at a black and white cat, dealing little damage.

    if viewer = 'target'
    A black and white cat claws you, causing great damage.

    if viewer = 'other'
    A black and white cat claws at Geronimo, causing great damage.
    */

    let ATTACKER = ''
    let TARGET = ''
    let VERB = ''

    if( viewer === 'attacker' ) {
      if (attack.didMiss) {
        output = 'ATTACKER try to VERB TARGET, missing.\n'
      } else {
        output = 'ATTACKER VERB TARGET, dealing AMOUNT damage.\n'
      }
      ATTACKER = 'you'
      TARGET = targetName
      VERB = attack.verb

    } else if (viewer === 'target') {
      if (attack.didMiss) {
        output = 'ATTACKER tries to VERB TARGET, missing.\n'
        VERB = attack.verb
      } else {
        output = 'ATTACKER VERB TARGET, dealing AMOUNT damage.\n'
        VERB = conjugateVerb(attack.verb)
      }    
      ATTACKER = attackerName
      TARGET = 'you'  

    } else if (viewer === 'other') {
      if (attack.didMiss) {
        output = 'ATTACKER tries to VERB TARGET, missing.\n'
        VERB = attack.verb
      } else {
        output = 'ATTACKER VERB TARGET, dealing AMOUNT damage.\n'
        VERB = conjugateVerb(attack.verb)
      }    
      ATTACKER = attackerName
      TARGET = targetName

    }

    output = output.replace('ATTACKER', ATTACKER)
    output = output.replace('TARGET', TARGET)
    output = output.replace('VERB', VERB)

    if(! attack.didMiss) {
      let AMOUNT = getDamageAdjective(damage.targetInitialHp, attack.rolledDamage)
      output = output.replace('AMOUNT', AMOUNT)
    }

    // capitalize first letter
    output = output.slice(0,1).toUpperCase() + output.slice(1, output.length)

    return output
  }

}
