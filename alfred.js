/* 	todo

	- !help command detailing supported commands
		- maybe add to !greet message?
	- more detailed console.log() messages
		- category (action taken)
		- timestamp
		- recipient
		- guild/channel
	- minecraft command wrapper
	- credential verification for !hail
	- more reaction images
	- meme library?

*/

// test

const react_event = {
	MESSAGE_REACTION_ADD: 'messageReactionAdd',
	MESSAGE_REACTION_REMOVE: 'messageReactionRemove',
}

// file imports
const auth = require('./_auth.json')
const config = require('./config.json');
const phrasebook = require('./phrasebook.json')
const pack = require('./package.json')
const commands = require('./commands.json')
const points = require('./_points.json')

// native imports
const fs = require('fs')

// external dependencies
const Discord = require('discord.js')
const chalk = require('chalk')
const XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest
const moment = require('moment-timezone')
const con = require('rcon-client')

let rcon = new con.Rcon({packetResponseTimeout: 1000})

const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

const mp_keys = config.points

// Initialize Discord Bot
const bot = new Discord.Client();

bot.login(auth.token)

bot.on('error', console.error)

bot.on('ready', function (evt) {
	
	console.log("Connected as " + bot.user.tag)

	// bot.user.setActivity(`Happily serving ${bot.guilds.size} servers.`)
	
	// only runs this command in prod version
	if (bot.user.id == "581242288907223087") {
		
		var interval = 1000 * 60 * 60 * 1
		setInterval(function(){
			dailyChatPerms();
		}, interval);
		
		dailyChatPerms();
		
	}
	
});

bot.on('guildCreate', guild => {

	log(1, `New guild joined: ${guild.name} (id: ${guild.id}). This guild has ${guild.memberCount} members`)
	// bot.user.setActivity(`Happily serving ${bot.guilds.size} servers.`)

})

bot.on('guildMemberAdd', member => {
	
	member.addRole(member.guild.roles.find(role => role.name.toLowerCase() === "normie"));
	
	greet(member.user, member.guild)
	
})

bot.on('message', async message => {
	
	// ignore bot messages - can't give itself commands
	if (message.author.bot) return;
	
	// prod version (alfred) ignores message in playground (test server)
	if (message.guild && (bot.user.id == "581242288907223087") && (message.guild.id == "581242846615699466")) return;
	
	// ignore any message that doesn't have the command prefix in front
	if (message.content.indexOf(config.prefix) !== 0) return;
    
    // split input message into command + args
	const args = message.content.slice(config.prefix.length).trim().split(/ +/g);
	const cmd = args.shift().toLowerCase();

	// rejects commands sent from direct messages if they are classified as "guild only" commands
	// makes an exception for operators
	if ((!message.guild && commands[cmd].guild_only) && !validatePerms(message, false, true)) {

		deny(message, cmd, phrasebook.deny.dm_disallowed)
		return

	}
	
	switch(cmd) {

		case 'mp':

			statsChan = message.guild.channels.find(channel => channel.name === "stats")
			log(2, `${message.author.tag} | !${cmd} | ${message.guild ? `#${message.channel.name} in ${message.guild.name}` : "direct message"}`)

			if (!args[0]) {

				statsChan.send(await serverMPStats(message.guild))

			} else {

				const mentions = message.mentions.users

				if (!mentions.size) {

					switch(args[0]) {

						case 'stats':
	
							statsChan.send(await serverMPStats(message.guild))
							// message.channel.send(await serverMPStats(message.guild))
							break
	
						case 'me':
	
							statsChan.send((args[1] == 'more' ? getMpStats(message.author, message.guild, 0) + uMojiStats(message.author, message.guild) + uMPStats(message.author, message.guild) : getMpStats(message.author, message.guild, 1)  + "\n"))

							break

						default:

							message.channel.send(`Sorry ${message.author.username}, I wasn't expecting "${args[0]}" there, so I'm not sure how to process your request.`)
							break
	
					}

				} else if (mentions.size > 1) {

					// too many mentions
					message.channel.send("One user at a time, please.")

				} else {

					// one mention
					for ([id, user] of mentions) {

						if (user.id == bot.user.id) {
							message.channel.send(`Fancy yourself clever, master ${message.author.username}?`)
							break
						}

						statsChan.send((args[1] == 'more' ? getMpStats(user, message.guild, 0) + uMojiStats(user, message.guild) + uMPStats(user, message.guild) : getMpStats(user, message.guild, 1) + "\n"))

					}

				}

			}

			break
		
		case 'mc':
		
			if (!validatePerms(message, false, true)) {

				deny(message, cmd, phrasebook.deny.not_permitted)
				return

			}

			log(2, `${message.author.tag} | !${cmd} | ${message.guild ? `#${message.channel.name} in ${message.guild.name}` : "direct message"}`)
			log(1, `Attempting to connect to Minecraft server at ${auth.rcon_token.ip}.`)

			try {

				await rcon.connect({
					host: auth.rcon_token.ip,
					port: auth.rcon_token.port,
					password: auth.rcon_token.pass
				})

			} catch (e) {
		
				// errored out connecting to server via rcon
				log(0, e)
				message.channel.send(`I'm sorry ${message.author.username}, but I couldn't complete your request. I cannot reach the server.`)

			}

			let mc_cmd = args.join(" ")
			let response = await rcon.send(mc_cmd)

			if (response) {

				message.channel.send(
					"Here is what the server had to say:\n" + "```" + response + "```"
				)
				log(1, `Server response: ${response}`)

			}

			rcon.disconnect()

			break

		// greeting
		case 'greet':
		
			log(2, `${message.author.tag} | !${cmd} | ${message.guild ? `#${message.channel.name} in ${message.guild.name}` : "direct message"}`)
			greet(message.author, message.channel.guild)
			
			break

		case 'help':

			let req_command = args.shift();
			let message_reply_string = "";

			log(2, `${message.author.tag} | !${cmd} | ${message.guild ? `#${message.channel.name} in ${message.guild.name}` : "direct message"}`)

			// check if the user wants general help, or for a specific command
			if (!req_command){
					
					message_reply_string += "Here are some of the commands I know: \n";
					message_reply_string += getFormattedCommands()
					message_reply_string += "*For help with specific commands, try `!help <command>`*";

			} else { // the user wants help for a specific command

					// verify that the command exists in the commands JSON file
					if (commands[req_command]){

							message_reply_string += "**`!" + req_command + "`** - *" + commands[req_command].description + "*\n\n"

							// check to see if the command takes arguments
							if (commands[req_command].arguments){

								message_reply_string += "Arguments: \n";
								for (var argument in commands[req_command].arguments){
									if (!commands[req_command].arguments.hasOwnProperty(argument)) {
									 	//The current property is not a direct property of commands
									 	continue;
							 		}
									message_reply_string += "\t`" + argument + "`: *" + commands[req_command].arguments[argument] + "*\n";
								}

								message_reply_string += "\n"

							}

							// check to see if the command has a sample usage
							if (commands[req_command].hasOwnProperty("usage")){
								message_reply_string += "Example: `" + commands[req_command].usage + "`";
							}

							message_reply_string += ""
					}
					else {
						message_reply_string = "I am sorry, I do not recongnize that command. Reply `!help` for a list of commands.";
					}
			}

			message.channel.send(message_reply_string);

		break;

		// reaction image
		case 'img':
		
			log(2, `${message.author.tag} | !${cmd} | ${message.guild ? `#${message.channel.name} in ${message.guild.name}` : "direct message"}`)

			let type = args.shift()
			
			if (!type) {
				
				// randomly select a top-level reaction image to send
				select = getImg(config.reactionsPath)
				
				message.channel.send("", {
					files: [
						`${config.reactionsPath}/${select}`
					]
				})
				
			} else {
				
				type = type.toLowerCase()
				
				let possibleTypes = getTypes(config.reactionsPath)
				
				if (type == 'types' || type == 'help') {
					
					message.channel.send("Here are the image types that I can procure for you: \n```" + possibleTypes.join("\n") + "```Alternatively, you can forgo the type argument and I will send you an image of my choosing.")
					log(1, `${message.author.tag} asked for help in ${message.guild ? `#${message.channel.name} of ${message.guild.name}` : "direct message"}`)
					return
					
				}
				
				if (possibleTypes.includes(type)) {
					
					select = getImg(`${config.reactionsPath}\\${type}`)
				
					message.channel.send("", {
						files: [
							`${config.reactionsPath}\\${type}\\${select}`
						]
					})

				} else {


					var searchString = ``

					if (args.length) {
						searchString = `${type} ${args.join(" ")}`
					} else {
						searchString = type
					}

					select = getTenor(searchString)

					message.channel.send("", {
						files: [
							select
						]
					})

				}
				
			}

			log(3, `"${select}" to ${message.guild ? `#${message.channel.name} in ${message.guild.name}` : "direct message"}`)
		
			break
		
		// !ring
		case 'ring':
		
			message.channel.send("At your service.")
			log(2, `${message.author.tag} | !${cmd} | ${message.guild ? `#${message.channel.name} in ${message.guild.name}` : "direct message"}`)
			
		break;
		
		// !gorilla
		case 'gorilla':
		
			message.channel.send(`Per master ${message.author.username}'s request, a transcription from the ancient texts:\n${phrasebook.gorilla}`)
			log(2, `${message.author.tag} | !${cmd} | ${message.guild ? `#${message.channel.name} in ${message.guild.name}` : "direct message"}`)
			
		break;
		
		case 'hail':
		
			var mentions = message.mentions.users
			var hailed = []
			
			if (mentions.size == 0) {
				message.channel.send("I would be delighted to hail any number of members for you, but you must tell me whom.\nPerhaps try again with an '@' mention?")
				return
			}
			
			for ([id, user] of mentions) {
				user.send("Pardon the intrusion " + user.username + ", your attention has been requested from the **#" + message.channel.name + "** channel of ***" + message.guild.name + "***.")
				log(3, "Hailed " + user.username + " from " + message.channel.name + " in " + message.guild.name)
				hailed.push(user.username)
			}
			
			var hailString = ""
			if (hailed.length > 2) {
				
				for (let i = 0; i < hailed.length; i++) {
					
					if (i != hailed.length - 1) {
						hailString += hailed[i] + ", "
					} else {
						hailString += "and " + hailed[i] + " have been summoned."
					}
					
				}
				
			} else if (hailed.length == 2) {
				hailString = hailed[0] + " and " + hailed[1] + " have been summoned."
			} else {
				hailString = hailed[0] + " has been summoned."
			}
			
			message.channel.send(hailString)
		
		break;

		case 'p':

			for (let i = 0; i < config.ltypes.length; i++) {
				log(i, "Test message!")
			}

		break;
		
     }
	 
});

bot.on('messageReactionAdd', async (reaction, user) => {

	// doesn't track points for itself
	if (reaction.message.author.bot) return

	// no points awarded outside of meme channels
	if (!(reaction.message.channel.name.includes("meme"))) return

	if (!points[reaction.message.guild.id]) {
		points[reaction.message.guild.id] = {}
	}

	if (!points[reaction.message.guild.id][reaction.message.author.id]) {

		points[reaction.message.guild.id][reaction.message.author.id] = {
			name: reaction.message.author.tag,
			mp: 0,
			current_rank: 'Normie',
			gotten_reactions: {

			},
			used_reactions: {

			},
			reacted_to: [],
			total_mp_given: 0,
			given_to_self: 0
		}

	}
	
	if (!points[reaction.message.guild.id][user.id]) {

		points[reaction.message.guild.id][user.id] = {
			name: user.tag,
			mp: 0,
			current_rank: 'Normie',
			gotten_reactions: {

			},
			used_reactions: {

			},
			reacted_to: [],
			total_mp_given: 0,
			given_to_self: 0
		}

	} 

	//console.log(`${user.tag} reacted to ${reaction.message.author.tag}'s message with "${reaction.emoji.toString()}" in channel #${reaction.message.channel.name} of ${reaction.message.guild.name} (id: ${reaction.message.guild.id})`)

	var earned

	for (key in mp_keys) {

		if (mp_keys[key].includes(reaction.emoji.name)) {

			earned = parseInt(key)
			break

		} else {

			earned = 10

		}

	}

	// return if the user has reacted to their own message
	if (reaction.message.author == user) {

		points[reaction.message.guild.id][user.id].given_to_self += earned

		reaction.message.channel.send(`Sorry ${user.username}, reactions to your own messages won't earn you points.`)
		log(4, `${user.tag} tried to give themselves ${earned} meme points. New total :: ${points[reaction.message.guild.id][user.id].given_to_self} mp`)
		
		fs.writeFile("./points.json", JSON.stringify(points, null, 4), (err) => {
			if (err) log(0, err)
		})

		return

	}

	for (rank in config.point_ranks) {

		if (points[reaction.message.guild.id][reaction.message.author.id].mp >= config.point_ranks[rank]) {

			current_rank = rank
			// console.log(`Current rank for ${reaction.message.author.tag} is ${current_rank}.`)
			break

		}

	}

	// message author stat tracking ------------------------------------------
	// add value to total meme points
	points[reaction.message.guild.id][reaction.message.author.id].mp += earned

	// increment "gotten reactions" array with newly earned reaction
	if (!points[reaction.message.guild.id][reaction.message.author.id].gotten_reactions[reaction.emoji.name]) points[reaction.message.guild.id][reaction.message.author.id].gotten_reactions[reaction.emoji.name] = 0
	points[reaction.message.guild.id][reaction.message.author.id].gotten_reactions[reaction.emoji.name] += 1

	// reactor stat tracking -------------------------------------------------
	// add value to total meme points given
	points[reaction.message.guild.id][user.id].total_mp_given += earned

	// increment "used reactions" array
	if (!points[reaction.message.guild.id][user.id].used_reactions[reaction.emoji.name]) points[reaction.message.guild.id][user.id].used_reactions[reaction.emoji.name] = 0
	points[reaction.message.guild.id][user.id].used_reactions[reaction.emoji.name] += 1

	log(4, `(${reaction.message.guild.name}, #${reaction.message.channel.name}) | ${user.tag} gave ${earned} points to ${reaction.message.author.tag}! New total :: ${points[reaction.message.guild.id][reaction.message.author.id].mp} mp`)

	// awarding new role if passed
	for (rank in config.point_ranks) {

		if (points[reaction.message.guild.id][reaction.message.author.id].mp >= config.point_ranks[rank]) {
			new_rank = rank
			break
		}

	}

	if (!(new_rank == current_rank)) {

		reaction.message.channel.send(`<@${reaction.message.author.id}> has just achieved the rank **${new_rank}**!`)
		// console.log(Object.keys(config.point_ranks).map(x => x.toLowerCase()).includes(new_rank.toLowerCase()))

		// remove all other meme ranks
		for (rank in config.point_ranks) {
		
			await reaction.message.member.removeRole(reaction.message.guild.roles.find(role => role.name === rank.toLowerCase()))

		}
		
		reaction.message.member.addRole(reaction.message.guild.roles.find(role => role.name.toLowerCase() === new_rank.toLowerCase()))
		points[reaction.message.guild.id][reaction.message.author.id].current_rank = new_rank

		log(4, `(${reaction.message.guild.name}, #${reaction.message.channel.name}) | ${reaction.message.author.tag} achieved rank "${new_rank}"`)

	}

	fs.writeFile("./points.json", JSON.stringify(points, null, 4), (err) => {
		if (err) log(0, err)
	})

})

bot.on('messageReactionRemove', (reaction, user) => {

	// console.log(`${user.tag} removed reaction "${reaction.emoji.identifier}" in channel #${reaction.message.channel.name} of ${reaction.message.guild.name} (id: ${reaction.message.guild.id})`)

})

// manual creation of reaction events for uncached messages
bot.on('raw', async event => {

	if (!react_event.hasOwnProperty(event.t)) return

	// console.log(event.t)

	const { d: data } = event
	const user = bot.users.get(data.user_id)
	const channel = bot.channels.get(data.channel_id) || await user.createDM()

	// no need to emit custom reaction event if the message is already cached
	// discord.js will automatically do this
	if (channel.messages.has(data.message_id)) {
		// console.log("You know where I fucked up.")
		return
	}

	const message = await channel.fetchMessage(data.message_id)

	// check for emoji.id - unicode emojis don't have id inside emoji object
	const emojikey = (data.emoji.id) ? `${data.emoji.name}:${data.emoji.id}` : data.emoji.name
	const reaction = message.reactions.get(emojikey)

	// console.log(`emitted react event of type ${event.t}`)
	bot.emit(react_event[event.t], reaction, user)

})

// ==================================================================
// greet()
// user = User object (discord.js)
// guild = Guild object (discord.js)
// ------------------------------------------------------------------
// sends a canned greeting message to a user from the specified guild
// ==================================================================

function greet(user, guild) {
	
	user.send(`Greetings master ${user.username}, \n\nMy name is Alfred, and I am *${guild.name}*'s robot butler (botler for short). \nI am currently in development (version ${pack.version}), so if you have any questions about my services or functionality, please direct them to my developer, jwayk. \n\nEnjoy your stay, \nAlfred.`)
		
	log(1, `Greeted ${user.username} from ${guild.name}`)
	
}

// ==================================================================
// getTenor()
// type = String
// ------------------------------------------------------------------
// makes a call to the tenor api with the given type string
// returns a random reaction image selected based on the type given
// ==================================================================

function getTenor(type) {

	// parameters
	// key -> alfred's tenor key from auth.json
	// q -> query string (type)
	// locale -> "en_US"
	// contentfilter -> "low"
	// media_filter -> basic?
	// ar_range -> n/a
	// limit -> 50 (max)

	var requestUrl = `https://api.tenor.com/v1/search?q=${type}&key=${auth.tenor_key}&limit=20&locale=en_US&contentfilter=off`;
	var rObjects = getGifs(requestUrl)
	var gifs = rObjects["results"]

	let gifUrls = []

	for (let gif of gifs) {
		if (gif["media"][0]["gif"]["size"] < 8388120) {
			gifUrls.push(gif["media"][0]["gif"]["url"])
		}
	}

	// Math.floor(Math.random() * options.length)

	return gifUrls[Math.floor(Math.random() * gifUrls.length)]

}

function processTenor(responseText) {

	var rObjects = JSON.parse(responseText)

	gifs = rObjects["results"]

	return gifs

}

function getGifs(url) {

	var xhr = new XMLHttpRequest()

	// xmlHttp.onreadystatechange = function() {

	// 	if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
	// 		callback(xmlHttp.responseText)
	// 	}

	// }

	xhr.open("GET", url, false)
	xhr.send(null)

	if (xhr.status === 200) {
		return JSON.parse(xhr.responseText)
	}

}

// ==================================================================
// getTenor()
// directory = String (in format C:\\subdir\\subdir)
// ------------------------------------------------------------------
// scans the selected directory for files, ignoring directories
// returns the name of a random file in the directory (including
// file extension)
// ==================================================================

function getImg(directory) {
	
	options = fs.readdirSync(directory, { withFileTypes: true }).filter(dirent => !dirent.isDirectory()).map(dirent => dirent.name)
	return options[Math.floor(Math.random() * options.length)]
	
}

// ==================================================================
// getTypes()
// directory = String (in format C:\\subdir\\subdir)
// ------------------------------------------------------------------
// returns an array of all top-level folder names in the given
// directory
// ==================================================================

function getTypes(directory) {
	
	return fs.readdirSync(directory, { withFileTypes: true }).filter(dirent => dirent.isDirectory()).map(dirent => dirent.name)
	
}

// ==================================================================
// validatePerms()
// message = Message object (discord.js)
// requiredLevel = floor value for lowest permission required to pass (optional) [WIP]
// operatorsOnly = Boolean (optional)
// ------------------------------------------------------------------
// 
// ==================================================================

function validatePerms(message, requiredLevel = false, operatorsOnly = false) {

	// optional specific user snowflake check, overrides all other checks
	if (operatorsOnly && !auth.operators.includes(message.author.id)) {

		return false

	}

	return true

}

// ==================================================================
// deny()
// message = Message object (discord.js)
// command = String
// reason = String
// ------------------------------------------------------------------
// 
// ==================================================================

function deny(message, command, reason) {

	message.channel.send(`I'm afraid I can't let you do that, ${message.author.username}. ${reason ? reason : ""}`)

	log(2, `Denied ${message.author.tag} use of !${command} in ${message.guild.name ? message.guild.name : "direct message"}. ${reason ? `Reason: ${reason}` : "No reason given."}`)

}

// ==================================================================
// getFormattedCommands
// includeHidden = Boolean (optional)
// ------------------------------------------------------------------
// 
// ==================================================================

function getFormattedCommands(includeHidden = false) {

	let string = "```\n"

	for (cmd in commands) {

		if (!includeHidden && commands[cmd].secret) {
			continue
		}

		let cmd_string = "      ||  "
		let format_string = ""

		for (j in cmd_string) {

			if (cmd[j]) {

				format_string += cmd[j]

			} else {

				format_string += cmd_string[j]
				
			}

		}
		
		format_string += commands[cmd].description
		string += format_string + "\n"

	}

	string += "\n```"

	return string

}

function getMpStats(user, guild, end) {

	if (!points[guild.id]) {
		return `Whoops, looks like I don't have any data for this server yet. Try again after there's been some activity.`
	}

	if (!points[guild.id][user.id]) {
		return `I'm afraid I don't have any records for you, ${user.username}. If you react to a post or gain reactions in an mp-enabled channel, I can start building a profile for you.`
	}

	user_mp = points[guild.id][user.id].mp
	first_bigger = 0
	ret_string = ""
	num_bars = 9

	next_rank = ""
	
	Object.keys(config.point_ranks).reverse().forEach(rank => {

		if (user_mp < config.point_ranks[rank] && !first_bigger) {
			next_rank = rank
			first_bigger = 1
		}

	})

	ret_string += "/////////////////////////////////\n\n"

	if (!next_rank) {

		// code here for higest rank

		ret_string += `__**MemeStats for ${user.tag}**__ :: *${points[guild.id][user.id].mp} mp*\n\n=============================\n**M A X   R A N K**  //////////////////\n=============================\n`

		return ret_string

	}

	// covers the elon's chosen display case (hides the role name with zalgo text)
	if (next_rank == "Elon's Chosen") {
		next_rank_disp = phrasebook.elo_zalgo
	} else {
		next_rank_disp = next_rank
	}

	// request is from someone who is already highest rank
	if (!first_bigger) {

	} else {

		ret_string += `__MemeStats for **${user.tag}**__ :: *${points[guild.id][user.id].mp.toLocaleString()} mp*\n\n`
		ret_string += `${points[guild.id][user.id].current_rank} -> ${next_rank_disp}\n`
		ret_string += "=============================\n"

		base_mp = config.point_ranks[points[guild.id][user.id].current_rank]
		target_mp = config.point_ranks[next_rank]

		target_norm = target_mp - base_mp
		user_norm = user_mp - base_mp

		pct = (user_norm/target_norm)*100
		progress = Math.floor((user_norm/target_norm)*num_bars)

		ret_string += `${base_mp.toLocaleString()} mp `

	}

	for (let i = 0; i < num_bars; i++) {

		if (i < progress) {
			ret_string += config.bar_chars["1"]
		} else {
			ret_string += config.bar_chars["0"]
		}

	}

	ret_string += ` ${target_mp.toLocaleString()} mp\n`
	ret_string += "=============================\n"
	ret_string += `Next rank in: ${(target_mp-user_mp).toLocaleString()} mp\n`
	ret_string += `Progress: ${pct.toFixed(0)}%\n`

	// ret_string += uMojiStats(user, guild)
	ret_string += end ? "============={-}==============\n\n" : "=============================\n"

	return ret_string

}

function uMojiStats(user, guild) {

	if (!points[guild.id]) return ""
	if (!points[guild.id][user.id]) return ""

	ret_string = ""

	used = points[guild.id][user.id].used_reactions
	u_keys = Object.keys(used)
	u_keys.sort((a, b) => {
		return used[b] - used[a]
	})

	ret_string += u_keys.length ? "Favorite emojis:\n" : ""

	for (let i = 0; i < 3; i++) {

		if (i >= u_keys.length) {
			break
		}

		ret_string += `\t${i+1}: ${u_keys[i]} - ${used[u_keys[i]]} ${(used[u_keys[i]] > 1) ? "uses" : "use"}\n`

	}

	rec = points[guild.id][user.id].gotten_reactions

	r_keys = Object.keys(rec)
	r_keys.sort((a, b) => {
		return rec[b] - rec[a]
	})

	ret_string += r_keys.length ? "=============================\nMost received emojis:\n" : ""

	for (let i = 0; i < 3; i++) {

		if (i >= r_keys.length) break

		ret_string += `\t${i+1}: ${r_keys[i]} - ${rec[r_keys[i]]} received\n`

	}

	ret_string += "=============================\n"

	return ret_string

}

function uMPStats(user, guild) {

	if (!points[guild.id]) return ""
	if (!points[guild.id][user.id]) return ""

	ret_string = ""

	ret_string += `*mp* given to others :: *${points[guild.id][user.id].total_mp_given.toLocaleString()} mp*\n`
	ret_string += `*mp* given to self :: *${points[guild.id][user.id].given_to_self.toLocaleString()} mp*\n`

	ret_string += "============={-}==============\n\n"

	return ret_string

}

async function serverMPStats(guild) {

	if (!points[guild.id]) return `Whoops, looks like I don't have any data for this server yet. Try again after there's been some activity.`

	ret_string = "/////////////////////////////////\n\n"

	ret_string += `__**${guild.name}** MemeStats__\n\n`

	ret_string += "Leaderboard ///////////////////////\n=============================\n"

	users = points[guild.id]
	u_keys = Object.keys(users)
	u_keys.sort((a, b) => {
		return users[b].mp - users[a].mp
	})

	for (let i = 0; i < 5; i++) {

		if (i >= u_keys.length) break

		user = await bot.fetchUser(u_keys[i])

		ret_string += `| |  ${i+1}. ${user.username} :: *${users[u_keys[i]].mp.toLocaleString()} mp* ${(i == 0) ? "🏆" : ""}\n`

	}

	ret_string += "=============================\n\n"

	ret_string += "Generous Users //////////////////\n=============================\n"

	u_keys.sort((a, b) => {
		return users[b].total_mp_given - users[a].total_mp_given
	})

	for (let i = 0; i < 3; i++) {

		if (i >= u_keys.length) break

		user = await bot.fetchUser(u_keys[i])

		ret_string += `| |  ${i+1}. ${user.username} :: *${users[u_keys[i]].total_mp_given.toLocaleString()} mp* given ${(i == 0) ? "💖" : ""}\n`

	}

	ret_string += "=============================\n\n"

	ret_string += "Top Participants ///////////////\n=============================\n"

	u_keys.sort((a, b) => {
		return (Math.abs(1-(users[b].mp/users[b].total_mp_given))) - (Math.abs(1-(users[a].mp/users[a].total_mp_given)))
	})

	for (let i = 0; i < 3; i++) {

		if (i >= u_keys.length) break

		user = await bot.fetchUser(u_keys[i])

		ret_string += `| |  ${i+1}. ${user.username} :: *${Math.abs(1-(users[u_keys[i]].mp/users[u_keys[i]].total_mp_given)).toLocaleString()} mp* ratio ${(i == 0) ? "🌟" : ""}\n`

	}

	ret_string += "=============================\n\n"

	return ret_string

}

function log(type, text) {

	var d = moment().tz("America/New_York");

	timestring = d.format("hh:mm:ss a")

	switch (type) {

		case 0:

			// ERROR
			console.log(`${chalk.white.bgRed(`[ ${config.ltypes[type]} | ${timestring} ]`)} ${chalk.white(`${text}`)}`)
			break

		case 1: 

			// INFO
			console.log(`${chalk.bgYellow(`[ ${config.ltypes[type]} | ${timestring} ]`)} ${chalk.white(`${text}`)}`)
			break
		
		case 2:

			// COMMAND
			console.log(`${chalk.bgBlue(`[ ${config.ltypes[type]} | ${timestring} ]`)} ${chalk.white(`${text}`)}`)
			break

		case 3:

			// SEND
			console.log(`${chalk.bgGreen(`[ ${config.ltypes[type]} | ${timestring} ]`)} ${chalk.white(`${text}`)}`)
			break

		case 4:

			// MEME POINTS
			console.log(`${chalk.bgMagenta(`[ ${config.ltypes[type]} | ${timestring} ]`)} ${chalk.white(`${text}`)}`)
			break
		

	}

}

function dailyChatPerms(){
	
	var d = moment().tz("America/New_York");
	var n = d.day();

	log(1, "Daily Chat permissions checked/updated. Day is " + days[n] + ".")
	// console.log("Current number of categories and channels under management: " + bot.channels.size)

	for (i in days) {

		// iterate over all daily channels
		// (ie channels with days of the week in their title)
		try {
			var dayColle = bot.channels.filter(channel => channel.name && channel.name.includes(days[i]))
		} catch (e) {
			log(0, "Unable to filter channels for '" + days[i] + "'. Error:")
			log(0, e)
			return
		}

		// make the channels invisible if the day isn't today
		for (var [k, chan] of dayColle) {

			if (i != n) {
				chan.overwritePermissions(chan.guild.defaultRole, { VIEW_CHANNEL: true, READ_MESSAGE_HISTORY: true, SEND_MESSAGES: false })
			} else {
				chan.overwritePermissions(chan.guild.defaultRole, { VIEW_CHANNEL: true, READ_MESSAGE_HISTORY: true, SEND_MESSAGES: true })
			}
			
		}
		
	}
	
};
