## Getting up and running with the ModuleLink Ionic project (Mac)

# Installing Node

Install the latest version of Node using the installer found here:

[https://nodejs.org/](https://nodejs.org/)

# Setting up iOS Tools

Install Xcode from Apple:

[https://developer.apple.com/xcode/downloads/](https://developer.apple.com/xcode/downloads/)

Once Xcode has been installed, run it and complete the initial setup process.

After you have completed the Xcode setup process, you must install the ios-sim node package in the command line:

    npm install -g ios-sim

# Setting up Android Tools

Install Android Studio from Google:

[https://developer.android.com/sdk/index.html](https://developer.android.com/sdk/index.html)

Leave the website open after you have downloaded it, because it lists the SDK Path which we’ll need later. Run the Android Studio installer and install all SDKs that are recommended.

After Android Studio has finished installing, run Android Studio (you may be asked to install JVM, do so at this time) and choose "Configure" -> “SDK Manager”. Check both the “Build Tools” and the actual SDK for Android version 19 and 21 if they are not already installed, and install them.

Download ANT from Apache and unzip it to a directory that you will add to the PATH in a minute:

[http://ant.apache.org/bindownload.cgi](http://ant.apache.org/bindownload.cgi)

Create a file called ".bash_profile" (if it doesn’t exist already) in your home directory with the following content:

    export ANDROID_HOME="<SDK PATH FROM ANDROID STUDIO>"
    export PATH=${PATH}:"<PATH YOU EXTRACTED ANT TO>"

At this point in time you should close the command line console and re-open it so your bash profile takes effect.

# Installing Ionic

You should have all of the required dependencies for Ionic by now, so we can install it and cordova via npm:

    npm install -g cordova ionic

# Setting up the ModuleLink Project

Clone the git repository (or download the .zip file directly) from the ModuleLink Ionic project:

[https://github.com/lsresearch/modulelink-ionic](https://github.com/lsresearch/modulelink-ionic)

or

[https://github.com/lsresearch/modulelink-ionic/archive/master.zip](https://github.com/lsresearch/modulelink-ionic/archive/master.zip)

Once you have the code unzipped in a directory, run the following commands while in the directory:

    ionic platform add android
    ionic platform add ios

Now you should be all set to go! Try running the app on your connected device:

    ionic run [ios/android]

