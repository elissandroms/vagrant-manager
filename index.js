'use strict'
const {app, Menu, Tray, BrowserWindow, nativeImage, dialog} = require('electron')
const command = require('shelljs/global')
const jquery = require('jquery')
const shellPath = require('shell-path')
const fs = require('fs')
const path = require('path')
const virtualbox = require('virtualbox')
const vbox = require('vboxmanagerjs').vboxmanager
const username = require('username')
const openLink = require('electron').shell

process.env.PATH = shellPath.sync()

function getIcon(path_icon) {
    return nativeImage.createFromPath(path_icon).resize({width: 16})
}

const trayActive = getIcon(path.join(__dirname,'assets/logo/trayIcon.png'))
const trayWait = getIcon(path.join(__dirname,'assets/logo/trayIconWait.png'))
const icon = path.join(__dirname,'/assets/logo/windowIcon.png')

if(process.platform === 'darwin') {
    app.dock.hide()
}

let tray = null
let aboutUs = null

const shouldQuit = app.makeSingleInstance(() => {
	dialog.showMessageBox({
        buttons: ['Ok'],
        message: 'Already running'
    })
	return true
})

if (shouldQuit) {
    app.quit()
}

app.on('ready', () =>
{
	tray = new Tray(trayActive)
	aboutUs = new BrowserWindow({
		width : 400,
		height : 600,
		resizable : false,
		fullscreen : false,
		title : 'About | Vagrant Manager',
		icon : icon,
		show : false,
	})

    aboutUs.on('close', function (e)
    {
        e.preventDefault()
        aboutUs.hide()
        if(process.platform === 'darwin') {
            app.dock.hide()
        }
        aboutUs.removeAllListeners('close')
    })

    aboutUs.on('show', function ()
    {
        if(process.platform === 'darwin') {
            app.dock.show()
        }
    })

	aboutUs.setMenu(null)
	aboutUs.loadURL('file:\/\/'+__dirname+'/about.html')
	// aboutUs.webContents.openDevTools()

	aboutUs.webContents.on('new-window', function(e, url) {
  		e.preventDefault()
  		openLink.openExternal(url)
	})

	function boxDetails(callback)
	{
        function getUserHome() {
            return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME']
        }

		var box = []
		var machineIndex = '/.vagrant.d/data/machine-index/index'

		fs.readFile(getUserHome()+machineIndex, 'utf8', function (err, data)
		{
			if (err) throw err
			var jsonData = JSON.parse(data)
			for(var index in jsonData.machines) {
				var short_path = jsonData.machines[index]['vagrantfile_path']
				short_path = short_path.split('/').reverse().filter((v, i) => {
					return i < 2
				}).reverse().join('/')
				box.push({
					'short_path': short_path,
					'path' 		: jsonData.machines[index]['vagrantfile_path'],
					'state' 	: jsonData.machines[index]['state'],
					'name' 		: jsonData.machines[index]['extra_data']['box']['name'],
					'provider'	: jsonData.machines[index]['extra_data']['box']['provider'],
				})
			}

			return callback(box)
		})
	}

function boxOptions(note,command,box,index,contextMenu,menuItem)
	{
		var text = 	{
						label: note,
						box: index,
						id: box[index]['path'],
						click: function(menuItem)
						{
							runShell(contextMenu, menuItem, 'vagrant '+command+'')
						}
					}
		return text
	}

	function boxStatus(index,note,box,value) 
	{
        var text =   {
                        label : note+': '+box[index][value],
                        enabled: false
					}
		return text
	}

	function errorBox(code,stderr) 
	{
		dialog.showMessageBox({
			type: 'error',
			buttons: ['Ok'],
			message: 'Code ' + code,
			detail : stderr
		})
	}

	var vagrantManager = function(event)
	{
		tray.setImage(trayActive)

		var sep = {type: 'separator'}
		boxDetails( function(box)
		{
			var menu = [
			{
				label: 'Refresh',
				click: function(menuItem)
				{
					vagrantManager()
				}
			}]
			menu.push(sep)
			for(var index in box) {
				menu.push(
				{
					label: box[index]['short_path'],
                    icon: getIcon(path.join(__dirname,'/assets/logo/'+box[index]['state']+'.png')),
					submenu: [
					{
						label: 'Up',
						box: index,
						id: box[index]['path'],
						click: function(menuItem)
						{
							runShell(contextMenu, menuItem, 'vagrant up')
						}
					},
					{
						label: 'Suspend',
						box: index,
						id: box[index]['path'],
						click: function(menuItem)
						{
							runShell(contextMenu, menuItem, 'vagrant suspend')
						}
					},
					{
						label: 'Resume',
						box: index,
						id: box[index]['path'],
						click: function(menuItem)
						{
							runShell(contextMenu, menuItem, 'vagrant resume')
						}
					},
					{
						label: 'Halt',
						box: index,
						id: box[index]['path'],
						click: function(menuItem)
						{
							runShell(contextMenu, menuItem, 'vagrant halt')
						}
					},										
					{
                        label: 'Destroy',
                        box: index,
                        id: box[index]['path'],
                        click: function(menuItem)
                        {
                            function getDialog() {
                                dialog.showMessageBox({
                                    type: 'warning',
                                    buttons: ['Yes', 'No'],
                                    message: 'Are you sure to destroy this vagrant instance?',
                                    cancelId: 1,
                                    defaultId: 1
                                }, function(response) {
                                    if(response === 0) {
                                        runShell(contextMenu, menuItem, 'vagrant destroy -f')
                                    }
                                })
                            }
                            getDialog()
                        }
					},
					sep,
					boxStatus(index,'Box',box,'name'),
					boxStatus(index,'Provider',box,'provider'),
					boxStatus(index,'Status',box,'state')
					]
				})
			}
			menu.push(sep)
			menu.push(
			{
				label: 'About',
				click: function (menuItem)
				{
					aboutUs.show()
				}
			},
			{
				label: 'Quit',
                click: function (menuItem)
                {
                    tray.destroy()
                    aboutUs.destroy()
                    app.quit()
                }
			})

			var contextMenu = Menu.buildFromTemplate(menu)
			tray.setToolTip('Vagrant Manager')
	  		tray.setContextMenu(contextMenu)
		})
	}

	let runShell = function(contextMenu, menuItem, command)
	{
		tray.setImage(trayWait)
		contextMenu.items[0].enabled = false
		var parentID = +menuItem.box + 2
		contextMenu.items[parentID].enabled = false
		tray.setContextMenu(contextMenu)
        let shellCommand = new exec('cd ' + menuItem.id + ' && '+ command, function(code, stdout, stderr)
		{

			if(code > 0) {
				errorBox(code,stderr);
			}

			vagrantManager()
		})
	}

	// Run
	vagrantManager()

})
