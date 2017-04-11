'use strict';
var lodash = require('lodash'),
    path = require('path'),
    fs = require('fs');

module.exports = function (grunt) {

    grunt.registerTask('fbd', 'Will automatically scan and freeze bower dependencies', ['freezeBowerDepsScan', 'freezeBowerDepsDo']);

    grunt.registerTask('freezeBowerDeps', 'Will automatically scan and freeze bower dependencies', ['freezeBowerDepsScan', 'freezeBowerDepsDo']);

    grunt.registerTask('freezeBowerDepsScan', 'Scan bower dependencies', freezeBowerDepsScan);
    grunt.registerTask('freezeBowerDepsDo', 'Freeze found bower dependencies', freezeBowerDependeciesDo);

    grunt.registerTask('fbds', 'Scan bower dependencies', ['freezeBowerDepsScan']);
    grunt.registerTask('fbdd', 'Freeze found bower dependencies', ['freezeBowerDepsDo']);

    function getTaskConfiguration() {
        return grunt.config('freezeBowerDeps.options');
    }

    function freezeBowerDepsScan() {
        var taskConfig = getTaskConfiguration(),
            scanFile = taskConfig.scanJSON || 'freezeBowerDeps_scan.json',

            listOfDotBowerJSONFiles = getListOfDotBowerJSONFiles(taskConfig),
            dependenciesToBeFrozen = getDependeciesFilesToBeFrozen(listOfDotBowerJSONFiles);

        if (Object.keys(dependenciesToBeFrozen).length === 0) {
            grunt.log.ok('Nothing to do here');
            return;
        }

        grunt.file.write(scanFile, JSON.stringify(dependenciesToBeFrozen));

        grunt.log.writeln('');
        grunt.log.ok([
            'Scan results saved to: `' + taskConfig.scanJSON + '`.',
            'You can modify this file by removing top level items,',
            'this way preventing given dependency from being frozen.',
            'Please run grunt freezeBowerDepsDo to perform actual freeze.',
            'Remember that scan result are only valid for 10 minutes!'
        ].join(' '));

        function getDependeciesFilesToBeFrozen(dotBowerJSONFiles) {

            var dependeciesToBeFrozen = {};

            lodash.each(dotBowerJSONFiles, function (dotBowerFilePath) {

                var dependencyDirectoryPath = path.dirname(dotBowerFilePath),
                    dependencyName = dependencyDirectoryPath.match(/([^\/]*)\/*$/)[1],

                    excludeList = lodash.get(taskConfig, ['excludeFiles', dependencyName], []),
                    includeList = lodash.get(taskConfig, ['includeFiles', dependencyName], []),

                    downloadedDotBowerJSON = grunt.file.readJSON(dotBowerFilePath),
                    lockedDotBowerJSON,

                    dependecyMainFilesList = lodash.isString(downloadedDotBowerJSON.main) ? [downloadedDotBowerJSON.main] : downloadedDotBowerJSON.main,

                    filesToCopy = getListOfFilesToCopy(dependecyMainFilesList),
                    additionalFilesToCopy = getListOfAdditionalFilesToCopy(includeList),

                    isDependencyAlreadyFreezed = checkIfDependecyIsAlreadyFrozen(dependencyName);

                if (isDependencyFreezedAndVersionsDiffer()) {
                    addToListOfDependeciesToBeFrozen();
                } else if (!isDependencyAlreadyFreezed) {
                    addToListOfDependeciesToBeFrozen();
                }

                function addToListOfDependeciesToBeFrozen() {
                    grunt.log.ok('"' + dependencyName + '" scheduled to be frozen at / updated to version ' + lodash.get(downloadedDotBowerJSON, 'version', '???'));

                    dependeciesToBeFrozen[dependencyName] = {
                        dependencyName: dependencyName,
                        actionDescription: 'from: `' + lodash.get(lockedDotBowerJSON, 'version', 'unknown/undefined') + '` to: `' + lodash.get(downloadedDotBowerJSON, 'version') + '`',
                        files: filesToCopy.concat(dotBowerFilePath, additionalFilesToCopy)
                    };
                }


                function isDependencyFreezedAndVersionsDiffer() {
                    return isInSyncMode() || (isDependencyAlreadyFreezed && areVersionsDifferent());
                }

                function isInSyncMode() {
                    return grunt.option('syncDeps') ? true : false;
                }

                function areVersionsDifferent() {
                    return lodash.get(lockedDotBowerJSON, 'version') !== lodash.get(downloadedDotBowerJSON, 'version');
                }

                function checkIfDependecyIsAlreadyFrozen() {
                    var isDependencyAlreadyFrozen = false,
                        dependencyDotBowerFile = taskConfig.vendorsFolder + '/' + dependencyName + '/.bower.json';

                    try {
                        lockedDotBowerJSON = grunt.file.readJSON(dependencyDotBowerFile);
                        isDependencyAlreadyFrozen = true;
                    } catch (e) {
                        grunt.verbose.warn('Unable to read: ' + dependencyDotBowerFile);
                    }

                    return isDependencyAlreadyFrozen;
                }

                function getListOfAdditionalFilesToCopy(includeList) {
                    var additionalFiles = grunt.file.expand({cwd: dependencyDirectoryPath}, includeList);

                    grunt.verbose.writeln('additional files that will be copied from ' + dependencyName + ': ', additionalFiles);

                    return getNormalizedPathToFilesInDependecyDirectory();

                    function getNormalizedPathToFilesInDependecyDirectory() {
                        return lodash.map(additionalFiles, function (filePath) {
                            return path.normalize(dependencyDirectoryPath + '/' + filePath);
                        });
                    }
                }

                function getListOfFilesToCopy(filesToExtract) {
                    var filesToCopy = [];

                    lodash.each(filesToExtract, function (fileToExtractPath) {

                        var fileExtension = getFileExtension(fileToExtractPath),
                            fileNameWithoutExtension = getFileNameWithoutExtension(fileToExtractPath, fileExtension),

                            completePathToFileWithoutExtension = getFileLocationWithoutItsExtension(),
                            completePathToFile = getCompletePathToFile();

                        if (isMinifiedVersionBasedOnFilename(fileToExtractPath)) {
                            addFileRegularVersionIfExistsIntoFilesToCopy();
                        } else {
                            addFileMinifiedVersionIfExistsIntoFilesToCopy();
                        }

                        addFileIntoFilesToCopy(completePathToFile);

                        function addFileIntoFilesToCopy(filePathToCopy) {

                            if (!shouldFileBeExcluded(filePathToCopy) && fileExists(filePathToCopy)) {
                                filesToCopy.push(filePathToCopy);
                                grunt.verbose.writeln('adding file: ' + filePathToCopy);
                            } else {
                                grunt.verbose.writeln('excluding: ' + filePathToCopy);
                            }
                        }

                        function addFileMinifiedVersionIfExistsIntoFilesToCopy() {
                            var theoreticalPathToMinifiedVersion = path.normalize([
                                    completePathToFileWithoutExtension,
                                    '.min',
                                    fileExtension
                                ].join(''));

                            try {
                                if (fileExists(theoreticalPathToMinifiedVersion)) {
                                    addFileIntoFilesToCopy(theoreticalPathToMinifiedVersion);
                                }
                            } catch (e) {}
                        }

                        function addFileRegularVersionIfExistsIntoFilesToCopy() {

                            var theoreticalPathToRegularVersion = path.normalize([
                                    completePathToFileWithoutExtension.replace(/\.min$/, ''),
                                    fileExtension
                                ].join(''));

                            try {
                                if (fileExists(theoreticalPathToRegularVersion)) {
                                    addFileIntoFilesToCopy(theoreticalPathToRegularVersion);
                                }
                            } catch (e) {}
                        }

                        function shouldFileBeExcluded(filePathToCopy) {
                            return grunt.file.isMatch({cwd: dependencyDirectoryPath}, excludeList, filePathToCopy);
                        }

                        function fileExists(path) {
                            return grunt.file.exists(path);
                        }

                        function getCompletePathToFile() {
                            return completePathToFileWithoutExtension + fileExtension;
                        }

                        function getFileExtension(file) {
                            return path.extname(file);
                        }

                        function getFileNameWithoutExtension(file, fileExtension) {
                            return path.basename(file, fileExtension);
                        }

                        function getFileLocationWithoutItsExtension() {
                            /**
                             * GLUE:
                             * path to directory where directories reside
                             * dirname of file to be extracted;
                             * filename without extension
                             */
                            return path.normalize([
                                dependencyDirectoryPath,
                                '/',
                                path.dirname(fileToExtractPath),
                                '/',
                                fileNameWithoutExtension
                            ].join(''));
                        }

                        function isMinifiedVersionBasedOnFilename(fileToExtractPath) {
                            return lodash.includes(fileToExtractPath, '.min.');
                        }
                    });

                    return filesToCopy;

                }
            });

            return dependeciesToBeFrozen;
        }

        function getListOfDotBowerJSONFiles(taskConfig) {
            return grunt.file.expand(taskConfig.bowerComponentsFolder + '/*/.bower.json');
        }
    }

    function freezeBowerDependeciesDo() {

        var taskConfig = getTaskConfiguration(),
            scanFile = taskConfig.scanJSON || 'freezeBowerDeps_scan.json',

            dependenciesToBeFrozen = getDependeciesFilesToBeFrozen();

        exitIfNoDependecies();
        freezeDependecies();

        function getDependeciesFilesToBeFrozen() {

            var stats,
                currentTime,
                scanCreationTime;

            if (grunt.file.exists(scanFile)) {

                stats = fs.statSync(scanFile);
                currentTime = +new Date();
                scanCreationTime = +new Date(stats.mtime);

                if (currentTime - scanCreationTime > 1000 * 60 * 10) {
                    grunt.fail.fatal('Scan file is older than 10 minutes. Please run freezeBowerDepsScan task again.');
                } else {
                    return grunt.file.readJSON(scanFile);
                }

            } else {
                grunt.log.error('No scan file file. Nothing to do');
            }

        }


        function freezeDependecies() {

            lodash.each(dependenciesToBeFrozen, function (dependencyDescriptor, dependencyName) {

                var dependencyFolder = getDependecyFolder(dependencyName);

                clearDependecyFolderIfRequired(dependencyFolder);
                copyFilesDependecies(dependencyDescriptor, dependencyFolder);
            });
        }

        function exitIfNoDependecies() {
            if (!lodash.size(dependenciesToBeFrozen)) {
                grunt.log.write('Nothing to update');
                return;
            }
        }

        function getDependecyFolder(dependencyName) {
            return path.normalize(taskConfig.vendorsFolder + '/' + dependencyName);
        }

        function copyFilesDependecies(dependencyDescriptor, copyFilesTo) {

            if (!dependencyDescriptor.files || !dependencyDescriptor.actionDescription || !dependencyDescriptor.dependencyName) {
                grunt.fail.fatal('Wrong dependency descriptor. Please check you scan JSON file. ', dependencyDescriptor);
            }

            lodash.each(dependencyDescriptor.files, function (fileToCopy) {
                grunt.verbose.writeln('copying: ', path.normalize(copyFilesTo + '/' + path.basename(fileToCopy)));
                grunt.file.copy(fileToCopy, path.normalize(copyFilesTo + '/' + path.basename(fileToCopy)));
            });

            grunt.log.ok(dependencyDescriptor.dependencyName + ' -> ' + dependencyDescriptor.actionDescription + '; DONE');
        }

        function clearDependecyFolderIfRequired(dependencyFolder) {
            if (!taskConfig.keepVendorsFolderOnUpdate && grunt.file.exists(dependencyFolder)) {
                grunt.file.delete(dependencyFolder);
            }
        }

    }
};
